import { cache } from "react";
import { notFound } from "next/navigation";

import { AppError } from "@/server/errors";
import { prisma } from "@/server/db";
import { requireUser, type CurrentUser } from "@/server/dal/session";

/**
 * Ownership guard for a single project.
 *
 * Every read and write of project data must pass through here. A project that
 * does not exist and a project owned by someone else produce the SAME
 * NOT_FOUND result, so the response never reveals whether an id is real.
 *
 * Admins are deliberately NOT granted access by this function — admin access to
 * student content is a separate, audit-logged path (see dal/admin.ts).
 */
export async function requireProject(projectId: string) {
  const user = await requireUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id, deletedAt: null },
  });

  // notFound() renders Next's 404 page. A project owned by someone else and a
  // project that does not exist are indistinguishable, so an id never leaks.
  if (!project) notFound();
  return { project, user };
}

/** Ownership check that returns only the id, for cheap write paths. */
export async function assertProjectOwnership(
  projectId: string,
  user?: CurrentUser,
): Promise<string> {
  const actor = user ?? (await requireUser());
  const found = await prisma.project.findFirst({
    where: { id: projectId, userId: actor.id, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw new AppError("NOT_FOUND");
  return found.id;
}

/** Projects for the dashboard, newest activity first. */
export const listProjects = cache(async (search?: string) => {
  const user = await requireUser();

  const term = search?.trim();
  return prisma.project.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: "insensitive" as const } },
              { topic: { contains: term, mode: "insensitive" as const } },
              { researchArea: { contains: term, mode: "insensitive" as const } },
              { institution: { department: { contains: term, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: { institution: { select: { department: true, institution: true } } },
    orderBy: { updatedAt: "desc" },
  });
});

/** Full project graph for the blueprint and workspace views. */
export async function getProjectDetail(projectId: string) {
  const { project, user } = await requireProject(projectId);

  const detail = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      institution: true,
      research: true,
      methodology: true,
      formatting: true,
      variables: { orderBy: { order: "asc" } },
      instructions: { orderBy: { createdAt: "asc" } },
      sections: { orderBy: [{ parentId: "asc" }, { order: "asc" }] },
      documents: { include: { extraction: { select: { status: true, pages: true } } } },
      sources: true,
    },
  });

  if (!detail) throw new AppError("NOT_FOUND");
  return { project: detail, user };
}
