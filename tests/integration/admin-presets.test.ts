import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db, resetDatabase } from "./helpers";

/**
 * Managing reference data.
 *
 * Presets are referenced by KEY or NAME, never by a foreign key — deliberately,
 * so a student at an institution nobody seeded is never blocked. The cost is
 * that the database will happily let an admin delete something projects are
 * still using, leaving them naming a value nothing recognises.
 *
 * There is no constraint to lean on, so these tests are the constraint.
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

const {
  createCitationStyle,
  createInstitution,
  createProjectType,
  deleteCitationStyle,
  deleteInstitution,
  deleteProjectType,
  renameProjectType,
} = await import("@/server/actions/admin-presets");

let counter = 0;
async function makeOwner() {
  counter += 1;
  return db.user.create({
    data: { name: `Owner ${counter}`, email: `owner-${counter}-${Date.now()}@example.com` },
  });
}

/**
 * Reference data survives `resetDatabase` by design — it is seeded, not fixture
 * data — so these tests have to clean up after themselves. Without this a
 * failed run leaves its rows behind and every later run sees a duplicate.
 */
const TEST_KEYS = ["capstone"];
const TEST_INSTITUTIONS = ["University of Nsukka", "Small College"];

async function clearTestPresets() {
  await db.projectTypeDef.deleteMany({ where: { key: { in: TEST_KEYS } } });
  await db.citationStyle.deleteMany({ where: { key: { in: ["vancouver"] } } });
  await db.institution.deleteMany({ where: { name: { in: TEST_INSTITUTIONS } } });
}

beforeEach(async () => {
  await resetDatabase();
  await clearTestPresets();
  const admin = await db.user.create({
    data: { name: "Admin", email: `admin-${Date.now()}@example.com`, role: "ADMIN" },
  });
  Object.assign(actor, { id: admin.id, email: admin.email, name: admin.name, role: "ADMIN" });
});

afterAll(async () => {
  await clearTestPresets();
  await db.$disconnect();
});

describe("project types", () => {
  it("creates one", async () => {
    expect((await createProjectType({ key: "capstone", label: "Capstone" })).ok).toBe(true);
    expect(await db.projectTypeDef.findUnique({ where: { key: "capstone" } })).not.toBeNull();
  });

  it("refuses a duplicate key", async () => {
    await createProjectType({ key: "capstone", label: "Capstone" });
    const again = await createProjectType({ key: "capstone", label: "Capstone Project" });

    expect(again.ok).toBe(false);
    expect(await db.projectTypeDef.count({ where: { key: "capstone" } })).toBe(1);
  });

  it("refuses a key that code could not branch on reliably", async () => {
    // `defaultStructureFor` compares this string exactly. A key with a capital
    // or a space would silently take the wrong branch.
    for (const key of ["Capstone", "capstone project", "capstone_project"]) {
      expect((await createProjectType({ key, label: "Capstone" })).ok, key).toBe(false);
    }
  });

  it("renames the label but never the key", async () => {
    await createProjectType({ key: "capstone", label: "Capstone" });
    const created = await db.projectTypeDef.findUniqueOrThrow({ where: { key: "capstone" } });

    await renameProjectType({ id: created.id, label: "Capstone Project" });

    const after = await db.projectTypeDef.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.label).toBe("Capstone Project");
    // The key is what projects stored. A label is presentation; a key is a
    // contract, and there is no action that can edit it.
    expect(after.key).toBe("capstone");
  });

  it("refuses to delete one that projects still use", async () => {
    await createProjectType({ key: "capstone", label: "Capstone" });
    const created = await db.projectTypeDef.findUniqueOrThrow({ where: { key: "capstone" } });

    const owner = await makeOwner();
    await db.project.create({
      data: { userId: owner.id, title: "In progress", kind: "REAL", projectType: "capstone" },
    });

    const result = await deleteProjectType({ id: created.id });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/1 project still uses/i);
    expect(await db.projectTypeDef.count({ where: { id: created.id } })).toBe(1);
  });

  it("allows deleting one only a DELETED project used", async () => {
    await createProjectType({ key: "capstone", label: "Capstone" });
    const created = await db.projectTypeDef.findUniqueOrThrow({ where: { key: "capstone" } });

    const owner = await makeOwner();
    await db.project.create({
      data: {
        userId: owner.id,
        title: "Abandoned",
        kind: "REAL",
        projectType: "capstone",
        deletedAt: new Date(),
      },
    });

    // A soft-deleted project is not something anyone is still working on, so it
    // should not pin reference data forever.
    expect((await deleteProjectType({ id: created.id })).ok).toBe(true);
  });
});

describe("citation styles", () => {
  it("refuses to delete one a project is formatted in", async () => {
    await createCitationStyle({ key: "vancouver", label: "Vancouver" });
    const created = await db.citationStyle.findUniqueOrThrow({ where: { key: "vancouver" } });

    const owner = await makeOwner();
    const project = await db.project.create({
      data: { userId: owner.id, title: "Formatted", kind: "REAL" },
    });
    await db.projectFormatting.create({
      data: { projectId: project.id, citationStyle: "vancouver" },
    });

    const result = await deleteCitationStyle({ id: created.id });

    expect(result.ok).toBe(false);
    expect(await db.citationStyle.count({ where: { id: created.id } })).toBe(1);
  });

  it("deletes an unused one", async () => {
    await createCitationStyle({ key: "vancouver", label: "Vancouver" });
    const created = await db.citationStyle.findUniqueOrThrow({ where: { key: "vancouver" } });

    expect((await deleteCitationStyle({ id: created.id })).ok).toBe(true);
    expect(await db.citationStyle.count({ where: { id: created.id } })).toBe(0);
  });
});

describe("institutions", () => {
  it("refuses to delete one that projects name", async () => {
    await createInstitution({ name: "University of Nsukka" });
    const created = await db.institution.findUniqueOrThrow({
      where: { name: "University of Nsukka" },
    });

    const owner = await makeOwner();
    const project = await db.project.create({
      data: { userId: owner.id, title: "Enrolled", kind: "REAL" },
    });
    // Matched by NAME, because that is how a project stores it.
    await db.projectInstitution.create({
      data: { projectId: project.id, institution: "University of Nsukka" },
    });

    const result = await deleteInstitution({ id: created.id });

    expect(result.ok).toBe(false);
    expect(await db.institution.count({ where: { id: created.id } })).toBe(1);
  });

  it("records the size of the cascade when one is removed", async () => {
    await createInstitution({ name: "Small College" });
    const created = await db.institution.findUniqueOrThrow({ where: { name: "Small College" } });
    const faculty = await db.faculty.create({
      data: { institutionId: created.id, name: "Science" },
    });
    await db.department.create({ data: { facultyId: faculty.id, name: "Biology" } });
    await db.department.create({ data: { facultyId: faculty.id, name: "Chemistry" } });

    expect((await deleteInstitution({ id: created.id })).ok).toBe(true);

    const entry = await db.auditLog.findFirstOrThrow({
      where: { action: "admin.preset.delete", targetId: created.id },
    });
    // The trail should show the size of what went, not only the row clicked.
    expect(entry.metadata).toMatchObject({ cascadedFaculties: 1, cascadedDepartments: 2 });
    expect(await db.department.count({ where: { faculty: { institutionId: created.id } } })).toBe(0);
  });
});

describe("the boundary", () => {
  it("refuses a non-admin, and reports not-found", async () => {
    actor.role = "STUDENT";

    const result = await createProjectType({ key: "capstone", label: "Capstone" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("NOT_FOUND");
    expect(await db.projectTypeDef.count({ where: { key: "capstone" } })).toBe(0);
  });

  it("audits every change against the admin who made it", async () => {
    await createProjectType({ key: "capstone", label: "Capstone" });
    const created = await db.projectTypeDef.findUniqueOrThrow({ where: { key: "capstone" } });
    await renameProjectType({ id: created.id, label: "Capstone Project" });
    await deleteProjectType({ id: created.id });

    const entries = await db.auditLog.findMany({ orderBy: { createdAt: "asc" } });

    expect(entries.map((e) => e.action)).toEqual([
      "admin.preset.create",
      "admin.preset.rename",
      "admin.preset.delete",
    ]);
    for (const entry of entries) expect(entry.userId).toBe(actor.id);
  });

  it("writes no audit row when a change is refused", async () => {
    await createProjectType({ key: "capstone", label: "Capstone" });
    const created = await db.projectTypeDef.findUniqueOrThrow({ where: { key: "capstone" } });

    const owner = await makeOwner();
    await db.project.create({
      data: { userId: owner.id, title: "In progress", kind: "REAL", projectType: "capstone" },
    });

    await deleteProjectType({ id: created.id });

    expect(await db.auditLog.count({ where: { action: "admin.preset.delete" } })).toBe(0);
  });
});
