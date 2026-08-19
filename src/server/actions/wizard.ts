"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { methodologyKeyFor, methodologySchemaFor } from "@/lib/methodology";
import { TOTAL_WIZARD_STEPS } from "@/lib/wizard-steps";
import { assertProjectOwnership } from "@/server/dal/projects";
import { prisma } from "@/server/db";
import { fail, ok, type ActionResult } from "@/server/errors";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Wizard autosave.
 *
 * Every step writes into its own normalised table rather than a JSON blob, so
 * the blueprint, consistency engine and export all read structured fields.
 * Every field is optional — the brief requires that no field be mandatory, so
 * partial saves are the normal case rather than an error.
 */

/** Trims strings and converts empty ones to null, so blank input clears a field. */
const optionalText = z
  .string()
  .trim()
  .max(5000)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

/** Drops blank entries so an untouched extra row never persists. */
const textList = z
  .array(z.string().trim().max(2000))
  .max(50)
  .optional()
  .transform((list) => (list ?? []).filter((item) => item.length > 0));

const projectIdSchema = z.string().min(1);

// ============================================================
// Completion
// ============================================================

/**
 * Recomputes how much of the setup is filled in.
 *
 * Counts answered fields across every step so the percentage reflects real
 * progress rather than which page the student happens to be on.
 */
async function recomputeCompletion(projectId: string): Promise<number> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      institution: true,
      research: true,
      formatting: true,
      methodology: true,
      instructions: { select: { id: true } },
      documents: { select: { id: true } },
      sections: { select: { id: true } },
    },
  });
  if (!project) return 0;

  const answered = (value: unknown): boolean =>
    value !== null && value !== undefined && String(value).trim().length > 0;

  const i = project.institution;
  const r = project.research;
  const f = project.formatting;

  const checks: boolean[] = [
    answered(i?.institution),
    answered(i?.department),
    answered(i?.programme),
    answered(i?.academicLevel),
    answered(project.projectType),
    answered(project.topic),
    answered(project.researchArea),
    answered(r?.researchProblem),
    answered(r?.aim),
    (r?.objectives.length ?? 0) > 0,
    (r?.researchQuestions.length ?? 0) > 0,
    answered(r?.studyLocation),
    answered(r?.targetPopulation),
    answered(r?.sampleSize),
    answered(r?.samplingTechnique),
    answered(r?.researchDesign),
    answered(r?.dataCollectionMethod),
    answered(r?.dataAnalysisMethod),
    project.methodology !== null,
    project.documents.length > 0,
    project.instructions.length > 0,
    answered(f?.citationStyle),
    answered(f?.font),
    project.sections.length > 0,
  ];

  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  await prisma.project.update({ where: { id: projectId }, data: { completionPct: pct } });
  return pct;
}

type StepResult = ActionResult<{ completionPct: number }>;

/** Shared tail for every step: bump the step marker, recompute, revalidate. */
async function finishStep(projectId: string, step: number): Promise<StepResult> {
  await prisma.project.update({ where: { id: projectId }, data: { wizardStep: step } });
  const completionPct = await recomputeCompletion(projectId);
  revalidatePath(`/projects/${projectId}`);
  return ok({ completionPct });
}

// ============================================================
// Step 1 — Institution
// ============================================================

const institutionSchema = z.object({
  projectId: projectIdSchema,
  institution: optionalText,
  campus: optionalText,
  faculty: optionalText,
  department: optionalText,
  programme: optionalText,
  degree: optionalText,
  academicLevel: optionalText,
});

export async function saveInstitutionStep(input: unknown): Promise<StepResult> {
  try {
    const { projectId, ...data } = institutionSchema.parse(input);
    const id = await assertProjectOwnership(projectId);
    await prisma.projectInstitution.upsert({
      where: { projectId: id },
      update: data,
      create: { projectId: id, ...data },
    });
    return await finishStep(id, 1);
  } catch (error) {
    return fail(error);
  }
}

// ============================================================
// Step 2 — Project type
// ============================================================

const projectTypeSchema = z.object({
  projectId: projectIdSchema,
  projectType: optionalText,
  projectTypeCustom: optionalText,
});

export async function saveProjectTypeStep(input: unknown): Promise<StepResult> {
  try {
    const { projectId, ...data } = projectTypeSchema.parse(input);
    const id = await assertProjectOwnership(projectId);
    await prisma.project.update({ where: { id }, data });
    return await finishStep(id, 2);
  } catch (error) {
    return fail(error);
  }
}

// ============================================================
// Step 3 — Topic
// ============================================================

const topicSchema = z.object({
  projectId: projectIdSchema,
  topic: optionalText,
  topicApproved: z.enum(["YES", "NO", "UNSURE"]).optional(),
  researchArea: optionalText,
  keywords: textList,
  description: optionalText,
});

export async function saveTopicStep(input: unknown): Promise<StepResult> {
  try {
    const { projectId, topicApproved, ...rest } = topicSchema.parse(input);
    const id = await assertProjectOwnership(projectId);
    await prisma.project.update({
      where: { id },
      data: { ...rest, ...(topicApproved ? { topicApproved } : {}) },
    });
    return await finishStep(id, 3);
  } catch (error) {
    return fail(error);
  }
}

// ============================================================
// Step 4 — Research information
// ============================================================

const researchSchema = z.object({
  projectId: projectIdSchema,
  researchProblem: optionalText,
  aim: optionalText,
  objectives: textList,
  researchQuestions: textList,
  hypotheses: textList,
  studyLocation: optionalText,
  targetPopulation: optionalText,
  samplePopulation: optionalText,
  sampleSize: optionalText,
  samplingTechnique: optionalText,
  researchDesign: optionalText,
  dataCollectionMethod: optionalText,
  researchInstruments: optionalText,
  dataAnalysisMethod: optionalText,
  theoreticalFramework: optionalText,
  conceptualFramework: optionalText,
  limitations: optionalText,
  scope: optionalText,
  keyTerminology: optionalText,
});

export async function saveResearchStep(input: unknown): Promise<StepResult> {
  try {
    const { projectId, ...data } = researchSchema.parse(input);
    const id = await assertProjectOwnership(projectId);
    await prisma.projectResearchDetails.upsert({
      where: { projectId: id },
      update: data,
      create: { projectId: id, ...data },
    });
    return await finishStep(id, 4);
  } catch (error) {
    return fail(error);
  }
}

// ============================================================
// Step 5 — Methodology (shape depends on project type)
// ============================================================

export async function saveMethodologyStep(input: unknown): Promise<StepResult> {
  try {
    const { projectId, data } = z
      .object({ projectId: projectIdSchema, data: z.record(z.string(), z.unknown()) })
      .parse(input);
    const id = await assertProjectOwnership(projectId);

    // The methodology key is derived server-side from the stored project type,
    // never taken from the client — so the payload cannot select its own schema.
    const project = await prisma.project.findUniqueOrThrow({
      where: { id },
      select: { projectType: true },
    });
    const key = methodologyKeyFor(project.projectType);
    // Zod's output is a plain record; Prisma wants its JSON input type. Undefined
    // values are dropped so a cleared field does not persist as null noise.
    const parsed = Object.fromEntries(
      Object.entries(methodologySchemaFor(key).parse(data)).filter(([, v]) => v !== undefined),
    ) as Prisma.InputJsonObject;

    await prisma.projectMethodology.upsert({
      where: { projectId: id },
      update: { type: key, data: parsed },
      create: { projectId: id, type: key, data: parsed },
    });
    return await finishStep(id, 5);
  } catch (error) {
    return fail(error);
  }
}

// ============================================================
// Step 7 — Additional information
// ============================================================

const instructionsSchema = z.object({
  projectId: projectIdSchema,
  student: z.string().trim().max(20000).optional(),
  supervisor: z.string().trim().max(20000).optional(),
  department: z.string().trim().max(20000).optional(),
});

export async function saveInstructionsStep(input: unknown): Promise<StepResult> {
  try {
    const { projectId, student, supervisor, department } = instructionsSchema.parse(input);
    const id = await assertProjectOwnership(projectId);

    const entries = [
      { source: "STUDENT" as const, content: student ?? "" },
      { source: "SUPERVISOR" as const, content: supervisor ?? "" },
      { source: "DEPARTMENT" as const, content: department ?? "" },
    ];

    // One row per source. Blank clears the row rather than storing an empty one.
    for (const entry of entries) {
      const existing = await prisma.projectInstruction.findFirst({
        where: { projectId: id, source: entry.source },
        select: { id: true },
      });
      if (entry.content.length === 0) {
        if (existing) await prisma.projectInstruction.delete({ where: { id: existing.id } });
        continue;
      }
      if (existing) {
        await prisma.projectInstruction.update({
          where: { id: existing.id },
          data: { content: entry.content },
        });
      } else {
        await prisma.projectInstruction.create({
          data: { projectId: id, source: entry.source, content: entry.content },
        });
      }
    }
    return await finishStep(id, 7);
  } catch (error) {
    return fail(error);
  }
}

// ============================================================
// Step 8 — Formatting
// ============================================================

const formattingSchema = z.object({
  projectId: projectIdSchema,
  citationStyle: optionalText,
  citationStyleCustom: optionalText,
  font: optionalText,
  fontSize: optionalText,
  lineSpacing: optionalText,
  paraSpacing: optionalText,
  margins: optionalText,
  headingStyle: optionalText,
  pageNumbering: optionalText,
  chapterNumbering: optionalText,
  referenceFormat: optionalText,
  tableFormat: optionalText,
  figureFormat: optionalText,
  customInstructions: optionalText,
});

export async function saveFormattingStep(input: unknown): Promise<StepResult> {
  try {
    const { projectId, ...data } = formattingSchema.parse(input);
    const id = await assertProjectOwnership(projectId);
    await prisma.projectFormatting.upsert({
      where: { projectId: id },
      update: data,
      create: { projectId: id, ...data },
    });
    return await finishStep(id, 8);
  } catch (error) {
    return fail(error);
  }
}

/** Applies a saved formatting preset without discarding the student's overrides. */
export async function applyFormattingPreset(input: unknown): Promise<ActionResult<Record<string, string>>> {
  try {
    const { projectId, key } = z
      .object({ projectId: projectIdSchema, key: z.string().min(1) })
      .parse(input);
    const id = await assertProjectOwnership(projectId);
    const preset = await prisma.formattingPreset.findUniqueOrThrow({ where: { key } });
    const values = preset.values as Record<string, string>;

    await prisma.projectFormatting.upsert({
      where: { projectId: id },
      update: values,
      create: { projectId: id, ...values },
    });
    await recomputeCompletion(id);
    revalidatePath(`/projects/${id}`);
    return ok(values);
  } catch (error) {
    return fail(error);
  }
}

// ============================================================
// Step 9 — Project structure
// ============================================================

const sectionInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  number: z.string().trim().max(20).optional(),
  children: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().trim().min(1).max(300),
        number: z.string().trim().max(20).optional(),
      }),
    )
    .max(40)
    .optional(),
});

const structureSchema = z.object({
  projectId: projectIdSchema,
  chapters: z.array(sectionInput).max(20),
});

/**
 * Saves the chapter/section tree.
 *
 * Existing sections are matched by id and updated in place so any content the
 * student has already written survives a rename or reorder. Only sections the
 * student actually removed are deleted.
 */
export async function saveStructureStep(input: unknown): Promise<StepResult> {
  try {
    const { projectId, chapters } = structureSchema.parse(input);
    const id = await assertProjectOwnership(projectId);

    const existing = await prisma.projectSection.findMany({
      where: { projectId: id },
      select: { id: true },
    });
    const kept = new Set<string>();

    for (const [chapterIndex, chapter] of chapters.entries()) {
      const chapterRow = chapter.id
        ? await prisma.projectSection.update({
            where: { id: chapter.id },
            data: { title: chapter.title, number: chapter.number ?? null, order: chapterIndex },
          })
        : await prisma.projectSection.create({
            data: {
              projectId: id,
              kind: "CHAPTER",
              title: chapter.title,
              number: chapter.number ?? null,
              order: chapterIndex,
            },
          });
      kept.add(chapterRow.id);

      for (const [childIndex, child] of (chapter.children ?? []).entries()) {
        const childRow = child.id
          ? await prisma.projectSection.update({
              where: { id: child.id },
              data: { title: child.title, number: child.number ?? null, order: childIndex },
            })
          : await prisma.projectSection.create({
              data: {
                projectId: id,
                parentId: chapterRow.id,
                kind: "SECTION",
                title: child.title,
                number: child.number ?? null,
                order: childIndex,
              },
            });
        kept.add(childRow.id);
      }
    }

    const removed = existing.filter((row) => !kept.has(row.id)).map((row) => row.id);
    if (removed.length > 0) {
      await prisma.projectSection.deleteMany({ where: { id: { in: removed }, projectId: id } });
    }

    return await finishStep(id, 9);
  } catch (error) {
    return fail(error);
  }
}

/** Records which step the student is on, so they resume where they left off. */
export async function setWizardStep(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId, step } = z
      .object({ projectId: projectIdSchema, step: z.number().int().min(1).max(TOTAL_WIZARD_STEPS) })
      .parse(input);
    const id = await assertProjectOwnership(projectId);
    await prisma.project.update({ where: { id }, data: { wizardStep: step } });
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
