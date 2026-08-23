import { z } from "zod";

import { AppError } from "@/server/errors";
import { prisma } from "@/server/db";
import { syncPlaceholders } from "@/server/services/placeholders";

/**
 * Version history.
 *
 * A snapshot is the project's section tree at a moment in time. Restoring one
 * takes a snapshot of the current state first, so a restore is itself
 * undoable — the failure mode worth designing against is a student restoring
 * an old version, realising it was the wrong one, and having lost the work
 * they were trying to get back to.
 *
 * Sections are restored by their original ids rather than deleted and
 * recreated. Placeholders and citations hang off those ids, so recreating them
 * would cascade the placeholders away and leave every citation pointing at a
 * section that no longer exists.
 */

/**
 * The stored snapshot shape.
 *
 * Versioned and parsed on read rather than trusted: a snapshot written by an
 * older build must fail loudly instead of restoring a half-understood shape
 * over a student's current work.
 */
const snapshotSchema = z.object({
  format: z.literal(1),
  projectTitle: z.string(),
  sections: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      number: z.string().nullable(),
      title: z.string(),
      content: z.string().nullable(),
      order: z.number().int(),
      wordCount: z.number().int().nonnegative().default(0),
    }),
  ),
});

export type ProjectSnapshot = z.infer<typeof snapshotSchema>;

export interface VersionSummary {
  id: string;
  number: number;
  label: string;
  createdAt: Date;
  sectionCount: number;
  wordCount: number;
}

/** Reads the project's current state into a snapshot payload. */
async function captureSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      title: true,
      sections: {
        select: {
          id: true,
          parentId: true,
          number: true,
          title: true,
          content: true,
          order: true,
          wordCount: true,
        },
      },
    },
  });

  if (!project) throw new AppError("NOT_FOUND");

  return {
    format: 1,
    projectTitle: project.title,
    sections: project.sections.map((section) => ({
      ...section,
      wordCount: section.wordCount ?? 0,
    })),
  };
}

/**
 * Saves a version of the project as it stands.
 *
 * Version numbers are allocated inside a transaction against the highest
 * existing one, because `@@unique([projectId, number])` would otherwise reject
 * two snapshots taken at the same moment — a student pressing save while a
 * generation run reaches its own checkpoint.
 */
export async function createVersion(projectId: string, label: string): Promise<VersionSummary> {
  const snapshot = await captureSnapshot(projectId);

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.projectVersion.findFirst({
      where: { projectId },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    return tx.projectVersion.create({
      data: {
        projectId,
        label: label.trim().slice(0, 200) || "Untitled version",
        number: (latest?.number ?? 0) + 1,
        snapshot,
      },
      select: { id: true, number: true, label: true, createdAt: true },
    });
  });

  return {
    ...created,
    sectionCount: snapshot.sections.length,
    wordCount: snapshot.sections.reduce((sum, s) => sum + s.wordCount, 0),
  };
}

/** Versions for a project, newest first. */
export async function listVersions(projectId: string): Promise<VersionSummary[]> {
  const rows = await prisma.projectVersion.findMany({
    where: { projectId },
    orderBy: { number: "desc" },
    select: { id: true, number: true, label: true, createdAt: true, snapshot: true },
  });

  return rows.map((row) => {
    const parsed = snapshotSchema.safeParse(row.snapshot);
    return {
      id: row.id,
      number: row.number,
      label: row.label,
      createdAt: row.createdAt,
      // An unreadable snapshot is still listed, so a student can see it exists
      // rather than having it vanish from the history.
      sectionCount: parsed.success ? parsed.data.sections.length : 0,
      wordCount: parsed.success
        ? parsed.data.sections.reduce((sum, s) => sum + s.wordCount, 0)
        : 0,
    };
  });
}

export interface RestoreOutcome {
  restoredFrom: number;
  /** The version created from the pre-restore state, so this can be undone. */
  safetyVersion: VersionSummary;
  sectionsRestored: number;
  sectionsRemoved: number;
}

/**
 * Restores a version over the project's current sections.
 *
 * The current state is snapshotted first and the restore runs in one
 * transaction, so a failure part-way through cannot leave the document as a
 * mixture of two versions.
 */
export async function restoreVersion(
  projectId: string,
  versionId: string,
): Promise<RestoreOutcome> {
  const version = await prisma.projectVersion.findFirst({
    where: { id: versionId, projectId },
    select: { id: true, number: true, label: true, snapshot: true },
  });

  if (!version) throw new AppError("NOT_FOUND");

  const parsed = snapshotSchema.safeParse(version.snapshot);
  if (!parsed.success) {
    throw new AppError("CONFLICT", {
      message:
        "This version was saved in an older format and cannot be restored safely. " +
        "Your current work has not been changed.",
    });
  }

  // Taken before anything is written, so the restore is undoable.
  const safetyVersion = await createVersion(
    projectId,
    `Before restoring version ${version.number}`,
  );

  const snapshot = parsed.data;
  const keepIds = new Set(snapshot.sections.map((s) => s.id));

  const removed = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectSection.findMany({
      where: { projectId },
      select: { id: true },
    });

    const toRemove = existing.filter((s) => !keepIds.has(s.id)).map((s) => s.id);
    if (toRemove.length > 0) {
      await tx.projectSection.deleteMany({ where: { id: { in: toRemove }, projectId } });
    }

    /*
     * Parents are written before children in two passes. A single pass in
     * snapshot order can try to attach a child to a parent that has not been
     * recreated yet, which the foreign key rejects.
     */
    const parents = snapshot.sections.filter((s) => s.parentId === null);
    const children = snapshot.sections.filter((s) => s.parentId !== null);

    for (const section of [...parents, ...children]) {
      await tx.projectSection.upsert({
        where: { id: section.id },
        create: {
          id: section.id,
          projectId,
          parentId: section.parentId,
          number: section.number,
          title: section.title,
          content: section.content,
          order: section.order,
          wordCount: section.wordCount,
        },
        update: {
          parentId: section.parentId,
          number: section.number,
          title: section.title,
          content: section.content,
          order: section.order,
          wordCount: section.wordCount,
        },
      });
    }

    return toRemove.length;
  });

  // Markers are derived from content, so they are recomputed rather than
  // restored — the tally must describe the text that is now in the document.
  for (const section of snapshot.sections) {
    await syncPlaceholders(section.id, section.content ?? "");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { title: snapshot.projectTitle },
  });

  return {
    restoredFrom: version.number,
    safetyVersion,
    sectionsRestored: snapshot.sections.length,
    sectionsRemoved: removed,
  };
}
