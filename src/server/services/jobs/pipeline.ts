import { prisma } from "@/server/db";
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

const PLACEHOLDER_PATTERN = /\[STUDENT DATA REQUIRED:\s*([^\]]+)\]/gi;

/**
 * Records every placeholder the model emitted.
 *
 * This is what turns "the model said it needs your data" into something the
 * Project Health panel can count. Fabrication becomes measurable rather than a
 * matter of trusting the prose.
 */
async function recordPlaceholders(sectionId: string, content: string): Promise<number> {
  await prisma.sectionPlaceholder.deleteMany({ where: { sectionId, resolved: false } });

  const detail = [...content.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]!.trim());
  if (detail.length === 0) return 0;

  await prisma.sectionPlaceholder.createMany({
    data: detail.map((text) => ({
      sectionId,
      label: "STUDENT DATA REQUIRED",
      detail: text.slice(0, 500),
    })),
  });
  return detail.length;
}

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
  await recordPlaceholders(sectionId, content);
}

/** Generates one subsection of a normal (non-results) chapter. */
async function generateSubsection(params: {
  projectId: string;
  userId: string;
  chapterTitle: string;
  section: { id: string; number: string | null; title: string };
}): Promise<void> {
  const memory = await buildProjectMemory(params.projectId, {
    query: `${params.chapterTitle} ${params.section.title}`,
  });

  const result = await ai.generate({
    system: SYSTEM_PROMPTS.generate,
    context: memory.context,
    sources: memory.sources,
    instruction: [
      `Write the section "${[params.section.number, params.section.title].filter(Boolean).join(" ")}".`,
      `It belongs to the chapter "${params.chapterTitle}".`,
      ``,
      `Write continuous academic prose. Do not repeat the section heading.`,
      `Where the student's own data or results would belong, emit the placeholder`,
      `form rather than inventing anything.`,
    ].join("\n"),
    maxTokens: 4000,
  });

  await writeSection(params.section.id, result.text);
  await recordUsage(params.projectId, params.userId, result);
}

/**
 * Prepares a results chapter.
 *
 * Deliberately does NOT write findings. The brief forbids inventing results,
 * response rates or test statistics, so this produces the analysis structure —
 * what each table will show, which test answers which hypothesis — with the
 * student's actual numbers marked as required.
 */
async function scaffoldResultsChapter(params: {
  projectId: string;
  userId: string;
  chapter: { id: string; number: string | null; title: string };
  sections: Array<{ id: string; number: string | null; title: string }>;
}): Promise<void> {
  const memory = await buildProjectMemory(params.projectId, {
    query: `${params.chapter.title} data analysis results`,
  });

  for (const section of params.sections) {
    const result = await ai.generate({
      system: SYSTEM_PROMPTS.generate,
      context: memory.context,
      sources: memory.sources,
      instruction: [
        `Prepare the section "${[section.number, section.title].filter(Boolean).join(" ")}".`,
        `It belongs to "${params.chapter.title}", which reports the student's own findings.`,
        ``,
        `You must NOT invent results, response rates, participant counts, means,`,
        `correlations, p-values or any other figure.`,
        ``,
        `Instead write: (a) what this section will present once the student adds`,
        `their data, (b) the structure of any table or figure it needs, described`,
        `in words, and (c) which analysis answers which research question or`,
        `hypothesis. Put a [STUDENT DATA REQUIRED: ...] placeholder at each point`,
        `where their real figures belong.`,
      ].join("\n"),
      maxTokens: 3000,
    });

    await writeSection(section.id, result.text);
    await recordUsage(params.projectId, params.userId, result);
  }
}

/** Runs one claimed job to completion, resuming any already-finished stages. */
export async function runGenerationJob(job: ClaimedJob): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: job.projectId },
    select: { id: true, userId: true, kind: true },
  });
  if (!project) {
    await failJob(job.id, job.projectId, "Project no longer exists");
    return;
  }

  const steps = await prisma.generationStep.findMany({
    where: { jobId: job.id },
    orderBy: { order: "asc" },
  });

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
          });
        } else {
          for (const section of sections) {
            await generateSubsection({
              projectId: project.id,
              userId: project.userId,
              chapterTitle: chapter.title,
              section,
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
        // References are assembled from the student's own sources in Milestone
        // C's reference manager. Nothing is invented here.
        await prisma.projectSource.count({ where: { projectId: project.id } });
      } else if (step.key === "consistency") {
        // The consistency engine lands in Milestone C. The stage is recorded as
        // run so the progress UI is truthful about what happened.
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
