"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";
import { SYSTEM_PROMPTS, ai, aiConfigured } from "@/server/services/ai";
import { sectionPlainText } from "@/server/services/ai/section-text";
import { assertCanEdit } from "@/server/services/entitlements";
import { buildProjectMemory } from "@/server/services/memory";
import { checkRateLimit } from "@/server/services/rate-limit";

/**
 * The front pages, and the one of them a model writes.
 *
 * Dedication and acknowledgements are the student's own words and are simply
 * stored. The abstract is derived from the finished project, so it is
 * regenerated rather than typed — and it is the page where the integrity rules
 * matter most, because an abstract is the part a supervisor reads first and
 * the easiest place to state findings that were never measured.
 */

const saveSchema = z.object({
  projectId: z.string().min(1),
  // Identity, which the Certification and Declaration pages name.
  matricNumber: z.string().trim().max(60).optional(),
  supervisorName: z.string().trim().max(120).optional(),
  supervisorTitle: z.string().trim().max(40).optional(),
  headOfDepartment: z.string().trim().max(120).optional(),
  // The student's own prose.
  dedication: z.string().trim().max(4_000).optional(),
  acknowledgements: z.string().trim().max(8_000).optional(),
  abstract: z.string().trim().max(8_000).optional(),
  keywords: z.string().trim().max(300).optional(),
});

/** An empty field means "remove this page", which is a null rather than "". */
const orNull = (value: string | undefined): string | null => (value?.trim() ? value.trim() : null);

export async function saveFrontMatter(input: unknown): Promise<ActionResult<null>> {
  try {
    const data = saveSchema.parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(data.projectId, user);

    /*
     * Two tables, because these are two different kinds of thing.
     *
     * Identity belongs with the rest of the institution record — it is the same
     * shape of fact as the department. The prose belongs on its own row because
     * it is written at a different time, at the end of a project rather than
     * during setup.
     */
    await prisma.$transaction([
      prisma.projectInstitution.upsert({
        where: { projectId: id },
        create: {
          projectId: id,
          matricNumber: orNull(data.matricNumber),
          supervisorName: orNull(data.supervisorName),
          supervisorTitle: orNull(data.supervisorTitle),
          headOfDepartment: orNull(data.headOfDepartment),
        },
        update: {
          matricNumber: orNull(data.matricNumber),
          supervisorName: orNull(data.supervisorName),
          supervisorTitle: orNull(data.supervisorTitle),
          headOfDepartment: orNull(data.headOfDepartment),
        },
      }),
      prisma.projectFrontMatter.upsert({
        where: { projectId: id },
        create: {
          projectId: id,
          dedication: orNull(data.dedication),
          acknowledgements: orNull(data.acknowledgements),
          abstract: orNull(data.abstract),
          keywords: orNull(data.keywords),
        },
        update: {
          dedication: orNull(data.dedication),
          acknowledgements: orNull(data.acknowledgements),
          abstract: orNull(data.abstract),
          keywords: orNull(data.keywords),
        },
      }),
    ]);

    revalidatePath(`/projects/${id}/export`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** How much of the project to show the model. Bounded, because it is the whole project. */
const ABSTRACT_CONTEXT_LIMIT = 900;

/**
 * Writes an abstract from the finished project.
 *
 * Draws on the project's own prose rather than its outline, because an abstract
 * has to state what was actually done and found. Each section is trimmed hard —
 * an abstract summarises, so the opening of each section carries most of what
 * it needs, and sending seventy pages to write three hundred words is waste.
 *
 * Counted against the editing allowance like any other call to the model.
 */
export async function generateAbstract(
  input: unknown,
): Promise<ActionResult<{ text: string; words: number }>> {
  try {
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    if (!aiConfigured) throw new AppError("AI_NOT_CONFIGURED");

    await checkRateLimit(`abstract:${user.id}`, ...LIMITS.rateLimit.aiAction);
    await assertCanEdit(user, id);

    const sections = await prisma.projectSection.findMany({
      where: { projectId: id },
      orderBy: [{ order: "asc" }],
      select: { number: true, title: true, content: true, parentId: true },
    });

    const written = sections
      .map((section) => {
        const body = sectionPlainText(section.content, ABSTRACT_CONTEXT_LIMIT);
        if (!body) return null;
        const label = [section.number, section.title].filter(Boolean).join(" ");
        return `## ${label}\n${body}`;
      })
      .filter(Boolean);

    /*
     * An abstract of nothing is not an abstract.
     *
     * Refusing here rather than sending an empty project and letting the model
     * improvise is the same rule the scaffold stage follows: the honest outcome
     * is to say there is nothing to summarise yet.
     */
    if (written.length === 0) {
      throw new AppError("VALIDATION", {
        message: `Project ${id} has no written sections to summarise`,
        userMessage:
          "There is nothing to summarise yet. Generate your project first, then write the abstract.",
      });
    }

    const memory = await buildProjectMemory(id, { query: "aim objectives methodology findings" });

    const result = await ai.edit({
      system: SYSTEM_PROMPTS.abstract,
      context: memory.context,
      sources: [],
      selection: written.join("\n\n"),
      instruction:
        "Write the abstract for this project, following the rules in your instructions. " +
        "Where the results sections still carry [STUDENT DATA REQUIRED] markers, say the " +
        "findings are pending rather than describing results.",
      maxTokens: 900,
    });

    const text = result.text.trim();

    await prisma.usageRecord.create({
      data: {
        userId: user.id,
        projectId: id,
        kind: "AI_EDIT",
        quantity: result.inputTokens + result.outputTokens,
        metadata: { surface: "abstract", model: result.model },
      },
    });

    // Stored immediately. An abstract the student has to remember to save is an
    // abstract that is lost when they close the tab.
    await prisma.projectFrontMatter.upsert({
      where: { projectId: id },
      create: { projectId: id, abstract: text },
      update: { abstract: text },
    });

    revalidatePath(`/projects/${id}/export`);
    return ok({ text, words: text.split(/\s+/).filter(Boolean).length });
  } catch (error) {
    return fail(error);
  }
}
