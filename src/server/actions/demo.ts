"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { entitlementsFor } from "@/config/plans";
import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";
import { DEMO_MARKER, demoFixture } from "@/server/services/demo/fixture";

/**
 * The seeded sample project.
 *
 * Built entirely from a fixture — no AI provider is involved — so the product is
 * explorable from a fresh install, and the sample is identical for everyone.
 */
export async function createDemoProject(): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();

    // One demo per user. A second click re-opens the existing one rather than
    // filling the dashboard with copies.
    const existing = await prisma.project.findFirst({
      where: { userId: user.id, kind: "DEMO", deletedAt: null },
      select: { id: true },
    });
    if (existing) return ok({ id: existing.id });

    const plan = entitlementsFor(user.planTier);
    const active = await prisma.project.count({
      where: { userId: user.id, deletedAt: null, status: { not: "ARCHIVED" } },
    });
    if (active >= plan.maxProjects) {
      throw new AppError("PLAN_LIMIT", { message: "Project limit reached" });
    }

    const f = demoFixture;

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        // Immutable from here: the database refuses to change it.
        kind: "DEMO",
        status: "READY",
        title: f.title,
        topic: f.topic,
        topicApproved: f.topicApproved,
        researchArea: f.researchArea,
        keywords: [...f.keywords],
        description: f.description,
        projectType: f.projectType,
        wizardStep: 9,
        completionPct: 100,
        lastGeneratedSection: "Chapter Five",
        institution: { create: { ...f.institution } },
        research: {
          create: {
            ...f.research,
            objectives: [...f.research.objectives],
            researchQuestions: [...f.research.researchQuestions],
            hypotheses: [...f.research.hypotheses],
          },
        },
        methodology: {
          create: { type: f.methodology.type, data: f.methodology.data },
        },
        formatting: { create: { ...f.formatting } },
      },
      select: { id: true },
    });

    // Chapters and their sections, preserving order.
    for (const [chapterIndex, chapter] of f.chapters.entries()) {
      const chapterRow = await prisma.projectSection.create({
        data: {
          projectId: project.id,
          kind: "CHAPTER",
          number: chapter.number,
          title: chapter.title,
          order: chapterIndex,
        },
        select: { id: true },
      });

      for (const [sectionIndex, section] of chapter.sections.entries()) {
        await prisma.projectSection.create({
          data: {
            projectId: project.id,
            parentId: chapterRow.id,
            kind: "SECTION",
            number: section.number,
            title: section.title,
            content: section.content,
            order: sectionIndex,
            wordCount: section.content.trim().split(/\s+/).length,
          },
        });
      }
    }

    for (const reference of f.references) {
      await prisma.projectReference.create({
        data: {
          projectId: project.id,
          authors: [...reference.authors],
          year: reference.year,
          title: reference.title,
          publication: reference.publication,
          volume: reference.volume,
          issue: reference.issue,
          pages: reference.pages,
          // Shown in a sample, not verified against a source.
          verification: "NEEDS_REVIEW",
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "project.demo.create",
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
 * Starts a real project from the sample.
 *
 * `kind` is immutable, so this creates a NEW project rather than reclassifying
 * the demo. It carries across the chapter structure and formatting preferences
 * only — never the sample's research data or its written prose, both of which
 * describe a study that is not the student's. Every section arrives empty with
 * a tracked placeholder, so what is still needed is countable rather than
 * buried in inherited text.
 */
export async function convertDemoToReal(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { projectId, title } = z
      .object({ projectId: z.string().min(1), title: z.string().trim().min(1).max(300) })
      .parse(input);

    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    const demo = await prisma.project.findUnique({
      where: { id },
      include: {
        formatting: true,
        sections: { orderBy: { order: "asc" } },
      },
    });
    if (!demo) throw new AppError("NOT_FOUND");
    if (demo.kind !== "DEMO") {
      throw new AppError("VALIDATION", { message: "Only a sample project can be converted" });
    }

    const created = await prisma.project.create({
      data: {
        userId: user.id,
        kind: "REAL",
        status: "DRAFT",
        title,
        // Formatting is a presentation preference, so it carries over.
        // Nothing describing the sample's study does.
        formatting: demo.formatting
          ? {
              create: {
                citationStyle: demo.formatting.citationStyle,
                font: demo.formatting.font,
                fontSize: demo.formatting.fontSize,
                lineSpacing: demo.formatting.lineSpacing,
                paraSpacing: demo.formatting.paraSpacing,
                margins: demo.formatting.margins,
                headingStyle: demo.formatting.headingStyle,
                pageNumbering: demo.formatting.pageNumbering,
                chapterNumbering: demo.formatting.chapterNumbering,
              },
            }
          : { create: {} },
        institution: { create: {} },
        research: { create: {} },
      },
      select: { id: true },
    });

    const chapters = demo.sections.filter((s) => s.parentId === null);
    for (const [chapterIndex, chapter] of chapters.entries()) {
      const chapterRow = await prisma.projectSection.create({
        data: {
          projectId: created.id,
          kind: "CHAPTER",
          number: chapter.number,
          title: chapter.title,
          order: chapterIndex,
        },
        select: { id: true },
      });

      const children = demo.sections.filter((s) => s.parentId === chapter.id);
      for (const [sectionIndex, section] of children.entries()) {
        const newSection = await prisma.projectSection.create({
          data: {
            projectId: created.id,
            parentId: chapterRow.id,
            kind: "SECTION",
            number: section.number,
            title: section.title,
            content: null,
            order: sectionIndex,
          },
          select: { id: true },
        });

        // A section that carried illustrative figures becomes an explicit,
        // countable request for the student's own data.
        const wasFabricated = (section.content ?? "").includes(DEMO_MARKER);
        await prisma.sectionPlaceholder.create({
          data: {
            sectionId: newSection.id,
            label: wasFabricated ? "STUDENT DATA REQUIRED" : "TO BE WRITTEN",
            detail: wasFabricated
              ? `"${section.title}" contained illustrative sample figures, which were not copied. This section needs your own results.`
              : `"${section.title}" is ready for your own writing.`,
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "project.demo.convert",
        targetType: "project",
        targetId: created.id,
        metadata: { fromDemo: id },
      },
    });

    revalidatePath("/dashboard");
    return ok({ id: created.id });
  } catch (error) {
    return fail(error);
  }
}
