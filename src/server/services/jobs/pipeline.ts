import { prisma } from "@/server/db";
import { syncPlaceholders } from "@/server/services/placeholders";
import { createVersion } from "@/server/services/versions";
import { analyseProject } from "@/server/services/consistency";
import { findSources } from "@/server/services/references";
import { parseFormatting } from "@/server/services/export/assemble";
import { computeBudget, distribute } from "@/server/services/generation/budget";
import { SYSTEM_PROMPTS, ai } from "@/server/services/ai";
import {
  completeJob,
  completeStep,
  failJob,
  failStep,
  heartbeat,
  startStep,
  type ClaimedJob,
} from "@/server/services/jobs/queue";
import { isResultsChapter } from "@/server/services/jobs/stages";
import { buildProjectMemory } from "@/server/services/memory";

/**
 * The staged generation pipeline.
 *
 * Each stage saves its work before the next begins, and a resumed job skips
 * stages already marked SUCCEEDED — so a failure at stage 8 costs stage 8, not
 * the seven that already succeeded. The brief's requirement that interrupted
 * generation never lose completed sections is enforced here.
 */


async function recordUsage(
  projectId: string,
  userId: string,
  usage: { inputTokens: number; outputTokens: number; model: string },
): Promise<void> {
  await prisma.usageRecord.create({
    data: {
      userId,
      projectId,
      kind: "AI_GENERATION",
      quantity: usage.inputTokens + usage.outputTokens,
      metadata: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model: usage.model,
      },
    },
  });
}

async function writeSection(
  sectionId: string,
  content: string,
): Promise<void> {
  await prisma.projectSection.update({
    where: { id: sectionId },
    data: { content, wordCount: content.trim().split(/\s+/).filter(Boolean).length },
  });
  await syncPlaceholders(sectionId, content);
}

/** Generates one subsection of a normal (non-results) chapter. */
async function generateSubsection(params: {
  projectId: string;
  userId: string;
  chapterTitle: string;
  section: { id: string; number: string | null; title: string };
  /** Words to aim for, when the student has asked for a page range. */
  targetWords: number | null;
  /** DEMO projects fabricate illustrative figures; REAL projects never do. */
  fabricate: boolean;
}): Promise<void> {
  const memory = await buildProjectMemory(params.projectId, {
    query: `${params.chapterTitle} ${params.section.title}`,
  });

  const lengthInstruction = params.targetWords
    ? [
        ``,
        `Aim for roughly ${params.targetWords} words here. That is a target for`,
        `pacing, not a quota — do not pad to reach it, and do not stop mid-argument`,
        `to stay under it.`,
      ]
    : [];

  const result = await ai.generate({
    // Chosen by the project's kind, which is immutable at the database level,
    // so a real project can never be walked into the fabricating path.
    system: params.fabricate ? SYSTEM_PROMPTS.generateDemo : SYSTEM_PROMPTS.generate,
    context: memory.context,
    sources: memory.sources,
    instruction: [
      `Write the section "${[params.section.number, params.section.title].filter(Boolean).join(" ")}".`,
      `It belongs to the chapter "${params.chapterTitle}".`,
      ``,
      `Write continuous academic prose. Do not repeat the section heading.`,
      ...(params.fabricate
        ? [
            `Invent plausible illustrative material where a finished project would`,
            `present it, keeping every figure consistent with the rest of the document.`,
          ]
        : [
            `Where the student's own data or results would belong, emit the placeholder`,
            `form rather than inventing anything.`,
          ]),
      ...lengthInstruction,
    ].join("\n"),
    // Deliberately larger than the target, so a section is never truncated
    // mid-sentence trying to land on it.
    maxTokens: params.targetWords ? Math.min(8000, params.targetWords * 3 + 800) : 4000,
  });

  await writeSection(params.section.id, result.text);
  await recordUsage(params.projectId, params.userId, result);
}

/**
 * Prepares a results chapter.
 *
 * For a REAL project this deliberately writes no findings. Inventing results,
 * response rates or test statistics is the one thing the product must never do,
 * so it produces the analysis structure instead — what each table will show,
 * which test answers which hypothesis — with the student's actual numbers
 * marked as required.
 *
 * For a DEMO the opposite holds: illustrative findings are written in full,
 * because a sample project that stopped at the results chapter would not show
 * what a finished project looks like. `fabricate` comes from the project's
 * kind, which a database trigger makes immutable.
 */
async function scaffoldResultsChapter(params: {
  projectId: string;
  userId: string;
  chapter: { id: string; number: string | null; title: string };
  sections: Array<{ id: string; number: string | null; title: string }>;
  /** Words per section id, when a page range was requested. */
  targets: Map<string, number>;
  /** DEMO projects report illustrative findings; REAL projects never do. */
  fabricate: boolean;
}): Promise<void> {
  const memory = await buildProjectMemory(params.projectId, {
    query: `${params.chapter.title} data analysis results`,
  });

  for (const section of params.sections) {
    const targetWords = params.targets.get(section.id) ?? null;

    const result = await ai.generate({
      system: params.fabricate ? SYSTEM_PROMPTS.generateDemo : SYSTEM_PROMPTS.generate,
      context: memory.context,
      sources: memory.sources,
      instruction: [
        `Prepare the section "${[section.number, section.title].filter(Boolean).join(" ")}".`,
        `It belongs to "${params.chapter.title}", which reports findings.`,
        ``,
        ...(params.fabricate
          ? [
              `This is a sample project, so present illustrative findings in full:`,
              `tables, percentages and test statistics, written as a completed study`,
              `would report them. Every figure must agree with the sample size and`,
              `design stated elsewhere in this document.`,
              ``,
              `State plainly, where the figures are first presented, that they are`,
              `illustrative and describe no real study.`,
            ]
          : [
              `You must NOT invent results, response rates, participant counts, means,`,
              `correlations, p-values or any other figure.`,
              ``,
              `Instead write: (a) what this section will present once the student adds`,
              `their data, (b) the structure of any table or figure it needs, described`,
              `in words, and (c) which analysis answers which research question or`,
              `hypothesis. Put a [STUDENT DATA REQUIRED: ...] placeholder at each point`,
              `where their real figures belong.`,
            ]),
        ...(targetWords
          ? ["", `Aim for roughly ${targetWords} words, as pacing rather than a quota.`]
          : []),
      ].join("\n"),
      maxTokens: targetWords ? Math.min(8000, targetWords * 3 + 800) : 3000,
    });

    await writeSection(section.id, result.text);
    await recordUsage(params.projectId, params.userId, result);
  }
}

/** Runs one claimed job to completion, resuming any already-finished stages. */
export async function runGenerationJob(job: ClaimedJob): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: job.projectId },
    select: {
      id: true,
      userId: true,
      kind: true,
      topic: true,
      title: true,
      researchArea: true,
      formatting: { select: { font: true, fontSize: true, lineSpacing: true, margins: true } },
      generation: {
        select: { minPages: true, maxPages: true, sourceRecencyYears: true, retrieveSources: true },
      },
    },
  });
  if (!project) {
    await failJob(job.id, job.projectId, "Project no longer exists", { retryable: false });
    return;
  }

  /*
   * A real project may not be written by a provider that cannot generate.
   *
   * The mock provider emits clearly-marked placeholder prose. That is right for
   * a development server with no key, but it must never land in a student's
   * actual project: they would open their work and find text announcing that no
   * AI provider is configured, sitting where their draft should be — and the
   * job would report SUCCEEDED over the top of it.
   *
   * Failing loudly is the honest outcome. The queue's provider pinning should
   * already prevent a mismatched worker from getting this far; this is the
   * second lock, on the side that actually writes to the project.
   */
  if (project.kind === "REAL" && !ai.isConfigured) {
    await failJob(
      job.id,
      job.projectId,
      `Refusing to generate a real project with the "${ai.name}" provider, which produces ` +
        `placeholder text rather than real prose. Configure an AI provider and run this again.`,
      // Not retryable: the provider will not become configured between
      // attempts, so retrying would only hold the project in GENERATING.
      { retryable: false },
    );
    return;
  }

  // Fabrication is gated on the project's kind, which a database trigger makes
  // immutable. A REAL project therefore cannot be turned into one that invents
  // its own findings, by this pipeline or by anything else.
  const fabricate = project.kind === "DEMO";

  /*
   * The word budget, computed once for the whole run.
   *
   * A model cannot target pages, so a requested page range becomes a word
   * budget using the student's own layout and is then divided across the
   * sections that carry prose — weighted, because a literature review is worth
   * several times a definition of terms.
   */
  const proseSections = await prisma.projectSection.findMany({
    where: { projectId: project.id, parentId: { not: null } },
    orderBy: { order: "asc" },
    select: { id: true, title: true, parent: { select: { title: true } } },
  });

  const budget = computeBudget(
    {
      minPages: project.generation?.minPages ?? null,
      maxPages: project.generation?.maxPages ?? null,
    },
    parseFormatting(project.formatting),
    proseSections.length,
  );

  const targets = new Map<string, number>();
  if (budget) {
    const allocation = distribute(
      budget,
      proseSections.map((section) => ({
        title: section.title,
        chapterTitle: section.parent?.title ?? "",
      })),
    );
    proseSections.forEach((section, index) => targets.set(section.id, allocation[index]!));
  }

  const steps = await prisma.generationStep.findMany({
    where: { jobId: job.id },
    orderBy: { order: "asc" },
  });

  /*
   * Snapshot before writing anything.
   *
   * Generation overwrites section content, so a student who has already
   * written something and then runs a generation would otherwise have no way
   * back. Only on the first attempt: a retry resumes a run that has already
   * taken its snapshot, and versioning again would bury the pre-generation
   * state under near-identical entries.
   *
   * A failure here is logged rather than thrown — losing the safety net is bad,
   * but refusing to generate because the safety net could not be written is
   * worse for the student in front of the screen.
   */
  const isFirstAttempt = steps.every((step) => step.status !== "SUCCEEDED");
  if (isFirstAttempt) {
    try {
      await createVersion(job.projectId, "Before generating");
    } catch (error) {
      console.error("[generation] could not snapshot before generating", error);
    }
  }

  try {
    for (const step of steps) {
      // Resume: a stage that already succeeded is never re-run or re-charged.
      if (step.status === "SUCCEEDED") continue;

      await startStep(job.id, step.key);
      await heartbeat(job.id);

      if (step.key.startsWith("chapter:")) {
        const chapterId = step.key.slice("chapter:".length);
        const chapter = await prisma.projectSection.findUnique({
          where: { id: chapterId },
          select: { id: true, number: true, title: true },
        });
        if (!chapter) {
          await failStep(job.id, step.key, "Chapter was deleted during generation");
          continue;
        }

        const sections = await prisma.projectSection.findMany({
          where: { parentId: chapterId },
          orderBy: { order: "asc" },
          select: { id: true, number: true, title: true },
        });

        if (isResultsChapter(chapter.title)) {
          await scaffoldResultsChapter({
            projectId: project.id,
            userId: project.userId,
            chapter,
            sections,
            targets,
            fabricate,
          });
        } else {
          for (const section of sections) {
            await generateSubsection({
              projectId: project.id,
              userId: project.userId,
              chapterTitle: chapter.title,
              section,
              targetWords: targets.get(section.id) ?? null,
              fabricate,
            });
            await heartbeat(job.id);
          }
        }

        await prisma.project.update({
          where: { id: project.id },
          data: {
            lastGeneratedSection: chapter.number
              ? `Chapter ${chapter.number}`
              : chapter.title,
          },
        });
      } else if (step.key === "analyse" || step.key === "outline") {
        // Both read existing structure rather than producing prose; the work is
        // validating that enough context exists to proceed.
        await buildProjectMemory(project.id);
      } else if (step.key === "references") {
        /*
         * Retrieve real published sources for the topic.
         *
         * Nothing is generated: records come from OpenAlex and Crossref, so
         * every citation resolves. A failure here is logged rather than thrown,
         * because losing the reading list is a much smaller harm than losing a
         * generation run the student has already waited for — and the reference
         * manager lets them retry it on its own.
         */
        if (project.generation?.retrieveSources !== false) {
          const query =
            [project.topic, project.researchArea].filter(Boolean).join(" ") || project.title;
          try {
            await findSources(project.id, {
              query,
              recencyYears: project.generation?.sourceRecencyYears ?? null,
            });
          } catch (error) {
            console.error("[generation] source retrieval failed", error);
          }
        }
      } else if (step.key === "consistency") {
        // Check the finished document against itself. Deterministic, so it
        // costs nothing and cannot invent a problem; findings are recorded for
        // the student to judge rather than acted on.
        try {
          await analyseProject(project.id);
        } catch (error) {
          console.error("[generation] consistency analysis failed", error);
        }
      }

      await completeStep(job.id, step.key);
      await heartbeat(job.id);
    }

    await completeJob(job.id, project.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { willRetry } = await failJob(job.id, project.id, message);
    console.error(
      `[worker] job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts})`,
      willRetry ? "— will retry" : "— giving up",
      message,
    );
  }
}
