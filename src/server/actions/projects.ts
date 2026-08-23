"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";
import { entitlementsFor } from "@/config/plans";
import { defaultStructureFor } from "@/lib/structures";

const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Give your project a working title").max(300),
});

/**
 * The fast path.
 *
 * A topic is longer than a working title, and short input here is almost
 * always a placeholder rather than a real subject — "test", "abc". The floor
 * exists because everything downstream is built from this one string, so a
 * two-character topic produces a whole project shaped around nothing.
 */
const fromTopicSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(12, "Describe your topic in a few words so there is something to build from")
    .max(300),
  projectType: z.string().trim().min(1).max(60),
});

/**
 * Creates a project from a topic alone and gives it a default structure.
 *
 * The wizard is optional by design, and some students will not fill any of it
 * in. This is the honest version of that: it sets the topic, picks a chapter
 * structure appropriate to the project type, and stops. It infers nothing else
 * — no institution, no research design, no sample — because the alternative is
 * making up a study the student never described.
 *
 * The consequence is visible rather than hidden. Generation emits
 * `[STUDENT DATA REQUIRED]` wherever the missing context was needed, and those
 * are counted on the dashboard and in Project Health, so a project built this
 * way shows exactly how much of it still needs its author. Completing the
 * wizard afterwards and regenerating is what closes the gap.
 *
 * It deliberately does not start generation. The student lands on the
 * blueprint, sees the structure that was chosen for them, and presses the
 * button themselves — a run is metered against their plan and costs real
 * money, so it should never begin from a typo.
 */
export async function createProjectFromTopic(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const { topic, projectType } = fromTopicSchema.parse(input);

    const plan = entitlementsFor(user.planTier);
    const active = await prisma.project.count({
      where: { userId: user.id, deletedAt: null, status: { not: "ARCHIVED" } },
    });
    if (active >= plan.maxProjects) {
      throw new AppError("PLAN_LIMIT", {
        message: `Project limit reached for the ${plan.label} plan`,
      });
    }

    // Only a type we actually seeded — the structure template and the
    // methodology form both key off this, so an unknown value would quietly
    // produce the wrong document shape.
    const known = await prisma.projectTypeDef.findUnique({
      where: { key: projectType },
      select: { key: true },
    });
    if (!known) {
      throw new AppError("VALIDATION", {
        userMessage: "Choose a project type from the list.",
      });
    }

    const chapters = defaultStructureFor(projectType);

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        // The topic doubles as the working title. A student who skipped setup
        // has given us exactly one piece of information; inventing a shorter
        // title from it would only be a second thing to correct.
        title: topic,
        topic,
        projectType,
        kind: "REAL",
        status: "DRAFT",
        institution: { create: {} },
        research: { create: {} },
        formatting: { create: {} },
      },
      select: { id: true },
    });

    /*
     * Sections in a second pass, mirroring `saveStructureStep`.
     *
     * `children` is a self-relation on ProjectSection, so a nested create under
     * it does NOT inherit the parent's projectId — and projectId is required.
     * Writing each row with its own is the only correct way to build the tree.
     */
    for (const [chapterIndex, chapter] of chapters.entries()) {
      const chapterRow = await prisma.projectSection.create({
        data: {
          projectId: project.id,
          kind: "CHAPTER",
          title: chapter.title,
          number: chapter.number || null,
          order: chapterIndex,
        },
        select: { id: true },
      });

      for (const [childIndex, child] of (chapter.children ?? []).entries()) {
        await prisma.projectSection.create({
          data: {
            projectId: project.id,
            parentId: chapterRow.id,
            kind: "SECTION",
            title: child.title,
            number: child.number || null,
            order: childIndex,
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "project.create.from_topic",
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
