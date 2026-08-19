"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";
import { entitlementsFor } from "@/config/plans";

const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Give your project a working title").max(300),
});

/**
 * Creates a DRAFT project and its empty related rows, so every wizard step has
 * a row to autosave into from the first keystroke.
 */
export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const { title } = createProjectSchema.parse(input);

    const plan = entitlementsFor(user.planTier);
    const active = await prisma.project.count({
      where: { userId: user.id, deletedAt: null, status: { not: "ARCHIVED" } },
    });
    if (active >= plan.maxProjects) {
      throw new AppError("PLAN_LIMIT", {
        message: `Project limit reached for the ${plan.label} plan`,
      });
    }

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title,
        kind: "REAL",
        status: "DRAFT",
        institution: { create: {} },
        research: { create: {} },
        formatting: { create: {} },
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "project.create",
        targetType: "project",
        targetId: project.id,
      },
    });

    revalidatePath("/dashboard");
    return ok({ id: project.id });
  } catch (error) {
    return fail(error);
  }
}

const renameSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "A project needs a title").max(300),
});

export async function renameProject(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId, title } = renameSchema.parse(input);
    const id = await assertProjectOwnership(projectId);
    await prisma.project.update({ where: { id }, data: { title } });
    revalidatePath("/dashboard");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Soft delete. The row is retained so an accidental delete is recoverable and
 * so audit history keeps referring to something real.
 */
export async function deleteProject(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "project.delete", targetType: "project", targetId: id },
    });

    revalidatePath("/dashboard");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Duplicates a project's configuration — not its generated prose. A duplicate
 * is a fresh starting point with the same setup, which is what students want
 * when a supervisor asks for a different angle on the same study.
 */
export async function duplicateProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(input);
    const user = await requireUser();
    await assertProjectOwnership(projectId, user);

    const source = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { institution: true, research: true, formatting: true, methodology: true },
    });

    const copy = await prisma.project.create({
      data: {
        userId: user.id,
        title: `${source.title} (copy)`,
        topic: source.topic,
        topicApproved: source.topicApproved,
        researchArea: source.researchArea,
        keywords: source.keywords,
        description: source.description,
        projectType: source.projectType,
        projectTypeCustom: source.projectTypeCustom,
        // A duplicate always starts as a DRAFT REAL project.
        kind: "REAL",
        status: "DRAFT",
        wizardStep: source.wizardStep,
        completionPct: source.completionPct,
        institution: source.institution
          ? {
              create: {
                institution: source.institution.institution,
                campus: source.institution.campus,
                faculty: source.institution.faculty,
                department: source.institution.department,
                programme: source.institution.programme,
                degree: source.institution.degree,
                academicLevel: source.institution.academicLevel,
              },
            }
          : { create: {} },
        research: source.research
          ? {
              create: {
                researchProblem: source.research.researchProblem,
                aim: source.research.aim,
                objectives: source.research.objectives,
                researchQuestions: source.research.researchQuestions,
                hypotheses: source.research.hypotheses,
                studyLocation: source.research.studyLocation,
                targetPopulation: source.research.targetPopulation,
                samplePopulation: source.research.samplePopulation,
                sampleSize: source.research.sampleSize,
                samplingTechnique: source.research.samplingTechnique,
                researchDesign: source.research.researchDesign,
                dataCollectionMethod: source.research.dataCollectionMethod,
                researchInstruments: source.research.researchInstruments,
                dataAnalysisMethod: source.research.dataAnalysisMethod,
                theoreticalFramework: source.research.theoreticalFramework,
                conceptualFramework: source.research.conceptualFramework,
                limitations: source.research.limitations,
                scope: source.research.scope,
                keyTerminology: source.research.keyTerminology,
              },
            }
          : { create: {} },
        formatting: source.formatting
          ? {
              create: {
                citationStyle: source.formatting.citationStyle,
                citationStyleCustom: source.formatting.citationStyleCustom,
                font: source.formatting.font,
                fontSize: source.formatting.fontSize,
                lineSpacing: source.formatting.lineSpacing,
                paraSpacing: source.formatting.paraSpacing,
                margins: source.formatting.margins,
                headingStyle: source.formatting.headingStyle,
                pageNumbering: source.formatting.pageNumbering,
                chapterNumbering: source.formatting.chapterNumbering,
                referenceFormat: source.formatting.referenceFormat,
                tableFormat: source.formatting.tableFormat,
                figureFormat: source.formatting.figureFormat,
                customInstructions: source.formatting.customInstructions,
              },
            }
          : { create: {} },
      },
      select: { id: true },
    });

    revalidatePath("/dashboard");
    return ok({ id: copy.id });
  } catch (error) {
    return fail(error);
  }
}
