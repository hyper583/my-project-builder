import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db, resetDatabase } from "./helpers";

/**
 * Creating a project from a topic alone.
 *
 * The wizard has always been optional, so this is not a lesser mode — it is
 * the honest shape of skipping it. The tests below are mostly about what it
 * must NOT do: a student who typed one sentence has told us one thing, and
 * everything else has to stay empty rather than be filled in on their behalf.
 * A project that quietly acquired a sample size or a research design it was
 * never given would be the exact failure the whole product exists to avoid.
 */

const user = { id: "", email: "", planTier: "FREE" as const, role: "STUDENT" as const, name: "" };

// The action resolves its own session; the DAL is stubbed so these tests
// exercise the action's logic rather than Better Auth's cookie handling.
vi.mock("@/server/dal/session", () => ({
  requireUser: async () => user,
  requireSession: async () => user,
}));

// `revalidatePath` needs a Next request context that vitest does not provide,
// and without this the action's own try/catch turns that into a failed result —
// every assertion below would fail for a reason that has nothing to do with the
// behaviour under test. Cache invalidation is Next's job, not this action's.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createProjectFromTopic } = await import("@/server/actions/projects");

const TOPIC = "Hand hygiene practices in primary schools in Nigeria";

beforeEach(async () => {
  await resetDatabase();
  const created = await db.user.create({
    data: { name: "Fast Path", email: `fast-${Date.now()}@example.com`, planTier: "FREE" },
  });
  Object.assign(user, created);

  // The action only accepts a seeded project type.
  await db.projectTypeDef.upsert({
    where: { key: "research-project" },
    update: {},
    create: { key: "research-project", label: "Research Project", methodologyKey: "general", order: 1 },
  });
  await db.projectTypeDef.upsert({
    where: { key: "project-proposal" },
    update: {},
    create: { key: "project-proposal", label: "Project Proposal", methodologyKey: "proposal", order: 2 },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("creating from a topic", () => {
  it("records the topic and gives the project a chapter structure", async () => {
    const result = await createProjectFromTopic({ topic: TOPIC, projectType: "research-project" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const project = await db.project.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(project.topic).toBe(TOPIC);
    expect(project.projectType).toBe("research-project");
    expect(project.kind).toBe("REAL");

    // Structure matters because `enqueueGeneration` builds its stages from the
    // chapters — without them a run would produce no chapter work at all.
    const chapters = await db.projectSection.findMany({
      where: { projectId: result.data.id, parentId: null },
      orderBy: { order: "asc" },
    });
    expect(chapters.length).toBeGreaterThanOrEqual(3);
  });

  it("gives every chapter its subsections, each carrying the project id", async () => {
    const result = await createProjectFromTopic({ topic: TOPIC, projectType: "research-project" });
    if (!result.ok) throw new Error(result.message);

    const children = await db.projectSection.findMany({
      where: { projectId: result.data.id, parentId: { not: null } },
    });

    // `children` is a self-relation, so a nested create does not inherit
    // projectId. Every child having one is what proves the tree was built
    // correctly rather than orphaned.
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) expect(child.projectId).toBe(result.data.id);
  });

  it("invents no research context whatsoever", async () => {
    const result = await createProjectFromTopic({ topic: TOPIC, projectType: "research-project" });
    if (!result.ok) throw new Error(result.message);

    const research = await db.projectResearchDetails.findUnique({
      where: { projectId: result.data.id },
    });
    const institution = await db.projectInstitution.findUnique({
      where: { projectId: result.data.id },
    });

    // The rows exist so the wizard has somewhere to autosave, but every field
    // a student would have supplied stays empty.
    expect(research?.researchProblem ?? null).toBeNull();
    expect(research?.aim ?? null).toBeNull();
    expect(research?.sampleSize ?? null).toBeNull();
    expect(research?.researchDesign ?? null).toBeNull();
    expect(research?.objectives ?? []).toEqual([]);
    expect(institution?.institution ?? null).toBeNull();
    expect(institution?.department ?? null).toBeNull();
  });

  it("writes no section content — the structure is empty until generation", async () => {
    const result = await createProjectFromTopic({ topic: TOPIC, projectType: "research-project" });
    if (!result.ok) throw new Error(result.message);

    const sections = await db.projectSection.findMany({ where: { projectId: result.data.id } });
    for (const section of sections) expect(section.content ?? "").toBe("");
  });

  it("uses the structure that matches the project type", async () => {
    const project = await createProjectFromTopic({ topic: TOPIC, projectType: "research-project" });
    const proposal = await createProjectFromTopic({ topic: TOPIC, projectType: "project-proposal" });
    if (!project.ok || !proposal.ok) throw new Error("setup failed");

    const count = async (id: string) =>
      db.projectSection.count({ where: { projectId: id, parentId: null } });

    // A proposal has no results chapter and is shorter. Getting this wrong
    // generates the wrong document shape entirely.
    expect(await count(proposal.data.id)).toBeLessThan(await count(project.data.id));
  });
});

describe("what it refuses", () => {
  it("rejects a topic too short to build anything from", async () => {
    const result = await createProjectFromTopic({ topic: "test", projectType: "research-project" });
    expect(result.ok).toBe(false);
  });

  it("rejects a project type that was never seeded", async () => {
    // The structure template and methodology form both key off this value, so
    // an unknown one would silently produce the wrong shape.
    const result = await createProjectFromTopic({
      topic: TOPIC,
      projectType: "not-a-real-type",
    });
    expect(result.ok).toBe(false);
  });

  it("creates nothing when the type is rejected", async () => {
    await createProjectFromTopic({ topic: TOPIC, projectType: "not-a-real-type" });
    expect(await db.project.count()).toBe(0);
  });

  it("honours the plan's project limit", async () => {
    // FREE allows two.
    await createProjectFromTopic({ topic: TOPIC, projectType: "research-project" });
    await createProjectFromTopic({ topic: TOPIC, projectType: "research-project" });
    const third = await createProjectFromTopic({ topic: TOPIC, projectType: "research-project" });

    expect(third.ok).toBe(false);
    expect(await db.project.count()).toBe(2);
  });
});
