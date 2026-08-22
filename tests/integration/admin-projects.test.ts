import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db, resetDatabase } from "./helpers";

/**
 * Reading a student's work.
 *
 * This is the one capability in the console that reaches into someone's
 * unpublished writing, and the promise made in docs/admin-console.md is
 * specific: the capability exists, but it is never silent. These tests hold
 * that promise to the letter — that content and its audit row are the same
 * event, that metadata alone never triggers one, and that a non-admin cannot
 * reach any of it.
 */

const actor = { id: "", email: "", name: "", role: "ADMIN" as "ADMIN" | "STUDENT", planTier: "FREE" as const };

vi.mock("@/server/dal/session", () => ({
  requireUser: async () => actor,
  requireSession: async () => actor,
  requireAdmin: async () => {
    if (actor.role !== "ADMIN") {
      const { AppError } = await import("@/server/errors");
      throw new AppError("NOT_FOUND");
    }
    return actor;
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { revealProjectContent } = await import("@/server/actions/admin");
const { listAllProjects, getProjectMetadata } = await import("@/server/services/ops/projects");

let counter = 0;

async function seedProject(kind: "REAL" | "DEMO" = "REAL") {
  counter += 1;
  const owner = await db.user.create({
    data: { name: `Student ${counter}`, email: `student-${counter}-${Date.now()}@example.com` },
  });
  const project = await db.project.create({
    data: { userId: owner.id, title: `Project ${counter}`, kind, status: "DRAFT" },
  });
  const chapter = await db.projectSection.create({
    data: { projectId: project.id, parentId: null, number: "1", title: "Introduction", order: 1 },
  });
  await db.projectSection.create({
    data: {
      projectId: project.id,
      parentId: chapter.id,
      number: "1.1",
      title: "Background",
      content: "<p>The student's own words about hand hygiene.</p>",
      wordCount: 8,
      order: 1,
    },
  });
  return { owner, project };
}

beforeEach(async () => {
  await resetDatabase();
  const admin = await db.user.create({
    data: { name: "Admin", email: `admin-${Date.now()}@example.com`, role: "ADMIN" },
  });
  Object.assign(actor, { id: admin.id, email: admin.email, name: admin.name, role: "ADMIN" });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("reading content", () => {
  it("returns what the student wrote", async () => {
    const { project } = await seedProject();

    const result = await revealProjectContent({ projectId: project.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sections[0]?.content).toContain("hand hygiene");
  });

  it("records the read against the admin, naming the owner", async () => {
    const { owner, project } = await seedProject();

    await revealProjectContent({ projectId: project.id });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { action: "admin.project.read", targetId: project.id },
    });
    expect(entry.userId).toBe(actor.id);
    expect(entry.metadata).toMatchObject({ ownerEmail: owner.email, projectTitle: project.title });
  });

  it("records every read, not only the first", async () => {
    const { project } = await seedProject();

    await revealProjectContent({ projectId: project.id });
    await revealProjectContent({ projectId: project.id });

    // "They looked once, months ago" and "they have looked repeatedly" are
    // different facts, and only one of them is visible if reads are deduped.
    expect(
      await db.auditLog.count({ where: { action: "admin.project.read", targetId: project.id } }),
    ).toBe(2);
  });

  it("returns nothing at all for a project that does not exist", async () => {
    const result = await revealProjectContent({ projectId: "no-such-project" });

    expect(result.ok).toBe(false);
    expect(await db.auditLog.count({ where: { action: "admin.project.read" } })).toBe(0);
  });
});

describe("the boundary around it", () => {
  it("refuses a non-admin", async () => {
    const { project } = await seedProject();
    actor.role = "STUDENT";

    const result = await revealProjectContent({ projectId: project.id });

    expect(result.ok).toBe(false);
    // And nothing is recorded, because nothing was read.
    expect(await db.auditLog.count({ where: { action: "admin.project.read" } })).toBe(0);
  });

  it("reports the refusal as not-found, so the console does not confirm it exists", async () => {
    const { project } = await seedProject();
    actor.role = "STUDENT";

    const result = await revealProjectContent({ projectId: project.id });

    expect(result.ok === false && result.code).toBe("NOT_FOUND");
  });

  it("cannot alter the project it reads", async () => {
    const { project } = await seedProject();
    const before = await db.projectSection.findMany({
      where: { projectId: project.id },
      select: { content: true, title: true },
      orderBy: { order: "asc" },
    });

    await revealProjectContent({ projectId: project.id });

    // Read-only by construction. Support must be able to investigate a
    // complaint without being able to change the work it is about.
    const after = await db.projectSection.findMany({
      where: { projectId: project.id },
      select: { content: true, title: true },
      orderBy: { order: "asc" },
    });
    expect(after).toEqual(before);
  });
});

describe("metadata", () => {
  it("is not recorded, because it is not their writing", async () => {
    const { project } = await seedProject();

    await listAllProjects({});
    await getProjectMetadata(project.id);

    // Browsing the console must not fill the trail with noise, or the entries
    // that matter become impossible to find.
    expect(await db.auditLog.count()).toBe(0);
  });

  it("never carries section content", async () => {
    const { project } = await seedProject();

    const metadata = await getProjectMetadata(project.id);
    const serialised = JSON.stringify(metadata);

    // The type says so, but this is the property worth asserting: a page
    // cannot accidentally render prose it was never given.
    expect(serialised).not.toContain("hand hygiene");
  });

  it("hides deleted projects unless asked for them", async () => {
    const { project } = await seedProject();
    await db.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });

    expect(await listAllProjects({})).toHaveLength(0);

    const withDeleted = await listAllProjects({ includeDeleted: true });
    expect(withDeleted).toHaveLength(1);
    expect(withDeleted[0]?.deleted).toBe(true);
  });

  it("filters by kind", async () => {
    await seedProject("REAL");
    await seedProject("DEMO");

    expect(await listAllProjects({ kind: "DEMO" })).toHaveLength(1);
    expect((await listAllProjects({ kind: "DEMO" }))[0]?.kind).toBe("DEMO");
  });

  it("finds a project by its owner's email", async () => {
    const { owner } = await seedProject();
    await seedProject();

    const found = await listAllProjects({ search: owner.email });

    expect(found).toHaveLength(1);
    expect(found[0]?.ownerEmail).toBe(owner.email);
  });
});
