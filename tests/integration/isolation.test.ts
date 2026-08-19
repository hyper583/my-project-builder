import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";

/**
 * User isolation and the demo invariants.
 *
 * These are the properties that must hold no matter what the UI does, so they
 * are asserted against the database directly.
 */

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("user isolation", () => {
  it("scopes a project lookup to its owner", async () => {
    const [ada, chidi] = await Promise.all([createUser(), createUser()]);
    const adasProject = await createProject(ada.id, { title: "Ada's study" });

    // The shape every DAL read uses: filter by id AND userId.
    const asOwner = await db.project.findFirst({
      where: { id: adasProject.id, userId: ada.id, deletedAt: null },
    });
    const asOther = await db.project.findFirst({
      where: { id: adasProject.id, userId: chidi.id, deletedAt: null },
    });

    expect(asOwner?.id).toBe(adasProject.id);
    expect(asOther).toBeNull();
  });

  it("keeps a soft-deleted project out of the owner's own list", async () => {
    const ada = await createUser();
    const project = await createProject(ada.id);
    await db.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });

    const visible = await db.project.findMany({ where: { userId: ada.id, deletedAt: null } });
    expect(visible).toHaveLength(0);
  });

  it("removes a user's projects when the user is deleted", async () => {
    const ada = await createUser();
    await createProject(ada.id);
    await db.user.delete({ where: { id: ada.id } });

    expect(await db.project.count({ where: { userId: ada.id } })).toBe(0);
  });

  it("cascades a project delete through its whole graph", async () => {
    const ada = await createUser();
    const project = await createProject(ada.id);

    const chapter = await db.projectSection.create({
      data: { projectId: project.id, kind: "CHAPTER", title: "Chapter One", order: 0 },
    });
    await db.sectionPlaceholder.create({
      data: { sectionId: chapter.id, label: "STUDENT DATA REQUIRED" },
    });
    await db.projectInstitution.create({
      data: { projectId: project.id, institution: "Madonna University" },
    });

    await db.project.delete({ where: { id: project.id } });

    expect(await db.projectSection.count({ where: { projectId: project.id } })).toBe(0);
    expect(await db.sectionPlaceholder.count({ where: { sectionId: chapter.id } })).toBe(0);
    expect(await db.projectInstitution.count({ where: { projectId: project.id } })).toBe(0);
  });
});

describe("demo invariants", () => {
  it("refuses to change a project's kind, at the database level", async () => {
    const ada = await createUser();
    const demo = await createProject(ada.id, { kind: "DEMO" });

    // Enforced by a trigger, so it holds for every writer — not just this app.
    await expect(
      db.project.update({ where: { id: demo.id }, data: { kind: "REAL" } }),
    ).rejects.toThrow();

    const unchanged = await db.project.findUnique({ where: { id: demo.id } });
    expect(unchanged?.kind).toBe("DEMO");
  });

  it("refuses the reverse change too", async () => {
    const ada = await createUser();
    const real = await createProject(ada.id, { kind: "REAL" });

    await expect(
      db.project.update({ where: { id: real.id }, data: { kind: "DEMO" } }),
    ).rejects.toThrow();
  });

  it("allows other fields to be updated on a demo", async () => {
    const ada = await createUser();
    const demo = await createProject(ada.id, { kind: "DEMO" });

    const updated = await db.project.update({
      where: { id: demo.id },
      data: { title: "Renamed sample" },
    });
    expect(updated.title).toBe("Renamed sample");
    expect(updated.kind).toBe("DEMO");
  });
});

describe("plan entitlements are stored, not assumed", () => {
  it("defaults a new user to STUDENT on the FREE plan", async () => {
    const user = await createUser();
    expect(user.role).toBe("STUDENT");
    expect(user.planTier).toBe("FREE");
  });

  it("records a suspension that the session layer can act on", async () => {
    const user = await createUser();
    const suspended = await db.user.update({
      where: { id: user.id },
      data: { suspendedAt: new Date() },
    });
    expect(suspended.suspendedAt).not.toBeNull();
  });
});
