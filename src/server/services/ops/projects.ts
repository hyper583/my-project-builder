import { prisma } from "@/server/db";

/**
 * Every project, for administration.
 *
 * Metadata only — titles, owners, counts, dates. Reading what a student
 * actually wrote is a separate action that records itself; nothing in this
 * module returns section content, so a mistake in a page cannot accidentally
 * put prose on screen without the audit row that is supposed to accompany it.
 */

export interface AdminProjectRow {
  readonly id: string;
  readonly title: string;
  readonly kind: "REAL" | "DEMO";
  readonly status: string;
  readonly completionPct: number;
  readonly ownerEmail: string;
  readonly ownerId: string;
  readonly department: string | null;
  readonly institution: string | null;
  readonly sections: number;
  readonly placeholders: number;
  readonly deleted: boolean;
  readonly updatedAt: Date;
}

export interface ProjectFilters {
  readonly search?: string;
  readonly kind?: "REAL" | "DEMO";
  readonly status?: string;
  /** Soft-deleted projects are hidden unless asked for. */
  readonly includeDeleted?: boolean;
}

export async function listAllProjects(
  filters: ProjectFilters,
  limit = 100,
): Promise<AdminProjectRow[]> {
  const term = filters.search?.trim();

  const projects = await prisma.project.findMany({
    where: {
      ...(filters.includeDeleted ? {} : { deletedAt: null }),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: "insensitive" as const } },
              { topic: { contains: term, mode: "insensitive" as const } },
              { user: { email: { contains: term, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      completionPct: true,
      deletedAt: true,
      updatedAt: true,
      user: { select: { id: true, email: true } },
      institution: { select: { department: true, institution: true } },
      _count: { select: { sections: true } },
    },
  });

  if (projects.length === 0) return [];

  // Placeholders are the honest measure of how much of a project still needs
  // its author, and the one number an admin is most likely to be asked about.
  // Grouped rather than counted per project so the list does not slow down as
  // the table grows.
  const marked = await prisma.sectionPlaceholder.groupBy({
    by: ["sectionId"],
    where: {
      resolved: false,
      section: { projectId: { in: projects.map((p) => p.id) } },
    },
    _count: { _all: true },
  });

  const sectionIds = marked.map((m) => m.sectionId);
  const sectionOwners = sectionIds.length
    ? await prisma.projectSection.findMany({
        where: { id: { in: sectionIds } },
        select: { id: true, projectId: true },
      })
    : [];
  const projectOfSection = new Map(sectionOwners.map((s) => [s.id, s.projectId]));

  const placeholders = new Map<string, number>();
  for (const row of marked) {
    const projectId = projectOfSection.get(row.sectionId);
    if (!projectId) continue;
    placeholders.set(projectId, (placeholders.get(projectId) ?? 0) + row._count._all);
  }

  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    kind: project.kind,
    status: project.status,
    completionPct: project.completionPct,
    ownerEmail: project.user.email,
    ownerId: project.user.id,
    department: project.institution?.department ?? null,
    institution: project.institution?.institution ?? null,
    sections: project._count.sections,
    placeholders: placeholders.get(project.id) ?? 0,
    deleted: project.deletedAt !== null,
    updatedAt: project.updatedAt,
  }));
}

/** One project's metadata, without any of its prose. */
export async function getProjectMetadata(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      topic: true,
      kind: true,
      status: true,
      completionPct: true,
      projectType: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      user: { select: { id: true, email: true, name: true } },
      institution: { select: { institution: true, department: true, programme: true } },
      _count: { select: { sections: true, documents: true, references: true } },
    },
  });
}
