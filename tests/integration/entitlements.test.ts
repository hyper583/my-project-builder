import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import { FREE_PROJECT_ALLOWANCE, PASS_ALLOWANCE } from "@/config/plans";
import {
  assertCanGenerate,
  claimPass,
  projectEntitlements,
  unclaimedPassCount,
} from "@/server/services/entitlements";

/**
 * What a student may do with a project, and for how long.
 *
 * The model this replaced had no end at all: entitlements came from
 * `User.planTier`, so a single ₦25,000 payment granted a monthly-renewing
 * allowance forever and turned loss-making inside four months. An expiry date
 * would have been the obvious fix and the wrong one — students take months
 * over a final-year project, and a clock punishes the ones who are working.
 *
 * A pass is consumed by a project instead. These tests hold that seam shut.
 */

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

async function grantPass(userId: string) {
  return db.projectPass.create({ data: { userId, amountMinor: 2_500_000 } });
}

async function runGenerations(projectId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await db.generationJob.create({
      data: { projectId, status: "SUCCEEDED", provider: "mock" },
    });
  }
}

describe("which allowance applies", () => {
  it("gives a project with no pass the free allowance and no download", async () => {
    const user = await createUser();
    const project = await createProject(user.id);

    const entitlements = await projectEntitlements(user, project.id);

    expect(entitlements.basis).toBe("free");
    expect(entitlements.canExport).toBe(false);
    expect(entitlements.maxGenerations).toBe(FREE_PROJECT_ALLOWANCE.maxGenerations);
  });

  it("gives a project a pass was spent on the pass allowance", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    await grantPass(user.id);
    await claimPass(user.id, project.id);

    const entitlements = await projectEntitlements(user, project.id);

    expect(entitlements.basis).toBe("pass");
    expect(entitlements.canExport).toBe(true);
    expect(entitlements.maxGenerations).toBe(PASS_ALLOWANCE.maxGenerations);
  });

  it("does not let one project's pass release another", async () => {
    // The defect this whole model replaced was entitlement attaching to the
    // ACCOUNT: one payment released every project it would ever create.
    const user = await createUser();
    const paid = await createProject(user.id, { title: "Paid" });
    const unpaid = await createProject(user.id, { title: "Unpaid" });
    await grantPass(user.id);
    await claimPass(user.id, paid.id);

    expect((await projectEntitlements(user, paid.id)).canExport).toBe(true);
    expect((await projectEntitlements(user, unpaid.id)).canExport).toBe(false);
  });

  it("does not honour a pass another account paid for", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const project = await createProject(owner.id);
    await grantPass(owner.id);
    await claimPass(owner.id, project.id);

    expect((await projectEntitlements(stranger, project.id)).basis).toBe("free");
  });

  it("leaves admins unrestricted", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const project = await createProject(admin.id);

    const entitlements = await projectEntitlements(admin, project.id);

    expect(entitlements.basis).toBe("admin");
    expect(entitlements.canExport).toBe(true);
    expect(entitlements.maxGenerations).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("spending a pass", () => {
  it("spends exactly one, however many are held", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    await grantPass(user.id);
    await grantPass(user.id);

    expect(await claimPass(user.id, project.id)).toBe(true);
    expect(await unclaimedPassCount(user.id)).toBe(1);
  });

  it("refuses when none are held", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    expect(await claimPass(user.id, project.id)).toBe(false);
  });

  it("cannot be spent twice concurrently", async () => {
    // Two requests racing for the last pass. The claim is a conditional update
    // rather than a read-then-write, so exactly one can win.
    const user = await createUser();
    const first = await createProject(user.id, { title: "First" });
    const second = await createProject(user.id, { title: "Second" });
    await grantPass(user.id);

    const results = await Promise.all([
      claimPass(user.id, first.id),
      claimPass(user.id, second.id),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await unclaimedPassCount(user.id)).toBe(0);
  });

  it("stays spent when the project it was spent on is deleted", async () => {
    /*
     * The abuse loop this guards: generate, download, delete the project, and
     * spend the same pass again. `claimedAt` is the authoritative marker rather
     * than `projectId`, which the delete releases.
     */
    const user = await createUser();
    const project = await createProject(user.id);
    await grantPass(user.id);
    await claimPass(user.id, project.id);

    await db.project.delete({ where: { id: project.id } });

    expect(await unclaimedPassCount(user.id)).toBe(0);
    const orphan = await db.projectPass.findFirst({ where: { userId: user.id } });
    expect(orphan?.projectId).toBeNull();
    expect(orphan?.claimedAt).not.toBeNull();
  });
});

describe("counting what has been used", () => {
  it("counts a pass project's runs against that project alone", async () => {
    const user = await createUser();
    const paid = await createProject(user.id, { title: "Paid" });
    const other = await createProject(user.id, { title: "Other" });
    await grantPass(user.id);
    await claimPass(user.id, paid.id);

    // Runs on a different project must not eat this project's allowance.
    await runGenerations(other.id, 5);
    await expect(assertCanGenerate(user, paid.id)).resolves.toBeTruthy();

    await runGenerations(paid.id, PASS_ALLOWANCE.maxGenerations);
    await expect(assertCanGenerate(user, paid.id)).rejects.toThrow(/limit/i);
  });

  it("counts free runs against the person, not the project", async () => {
    /*
     * Deliberately the other way round. The free allowance is acquisition
     * spend, so it is bounded per human — counted per project, someone could
     * delete and recreate their way to unlimited free generations.
     */
    const user = await createUser();
    const first = await createProject(user.id, { title: "First" });
    const second = await createProject(user.id, { title: "Second" });

    await runGenerations(first.id, FREE_PROJECT_ALLOWANCE.maxGenerations);

    await expect(assertCanGenerate(user, second.id)).rejects.toThrow(/limit/i);
  });

  it("does not renew a pass allowance with the calendar", async () => {
    // A pass is a quota on a project, not a monthly rate. Runs from long ago
    // still count against it — that is the whole difference from the model
    // this replaced.
    const user = await createUser();
    const project = await createProject(user.id);
    await grantPass(user.id);
    await claimPass(user.id, project.id);

    await runGenerations(project.id, PASS_ALLOWANCE.maxGenerations);
    await db.generationJob.updateMany({
      where: { projectId: project.id },
      data: { createdAt: new Date("2020-01-01") },
    });

    await expect(assertCanGenerate(user, project.id)).rejects.toThrow(/limit/i);
  });
});
