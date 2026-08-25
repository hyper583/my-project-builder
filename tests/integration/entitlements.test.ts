import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import {
  FREE_LIFETIME_PROJECTS,
  FREE_PROJECT_ALLOWANCE,
  PASS_ALLOWANCE,
} from "@/config/plans";
import {
  assertCanGenerate,
  claimPass,
  freeProjectsGenerated,
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

/**
 * A run as the lifetime counter sees it.
 *
 * `startGeneration` writes both a GenerationJob and a UsageRecord, and they are
 * read for different questions: the job answers "how many runs has this project
 * had", the usage record answers "how many free runs has this account ever
 * had". Only the second survives the project being deleted, which is the whole
 * reason it exists.
 */
async function recordRuns(userId: string, projectId: string, count: number) {
  await runGenerations(projectId, count);
  for (let i = 0; i < count; i += 1) {
    await db.usageRecord.create({
      data: { userId, projectId, kind: "AI_GENERATION", metadata: { basis: "free" } },
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

  it("leaves the sample project readable end to end", async () => {
    /*
     * The sample is the argument for buying anything, and it only works if a
     * student can see a whole finished project in it. Chapter-locking it would
     * apply the paywall to the shop window.
     *
     * Nothing is given away: the text is fixture content, the same for every
     * account, and every export of it is watermarked and disclaimed — which is
     * why `canExport` stays false here rather than being relaxed alongside.
     */
    const user = await createUser();
    const demo = await createProject(user.id, { kind: "DEMO", title: "Sample" });

    const entitlements = await projectEntitlements(user, demo.id);

    expect(entitlements.maxChapters).toBe(Number.POSITIVE_INFINITY);
    expect(entitlements.canExport).toBe(false);
  });

  it("still bounds a real project to one chapter without a pass", async () => {
    const user = await createUser();
    const project = await createProject(user.id, { kind: "REAL" });

    expect((await projectEntitlements(user, project.id)).maxChapters).toBe(
      FREE_PROJECT_ALLOWANCE.maxChapters,
    );
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

  it("gives a second free project its own run rather than a wait", async () => {
    /*
     * The free allowance used to be a rolling 30-day window on the person, so
     * starting a second project meant waiting a month to see a word of it —
     * punishing exactly the behaviour worth encouraging. Runs are counted per
     * project now; the per-account bound is a lifetime total instead.
     */
    const user = await createUser();
    const first = await createProject(user.id, { title: "First" });
    const second = await createProject(user.id, { title: "Second" });

    await recordRuns(user.id, first.id, FREE_PROJECT_ALLOWANCE.maxGenerations);

    await expect(assertCanGenerate(user, first.id)).rejects.toThrow(/limit reached/i);
    await expect(assertCanGenerate(user, second.id)).resolves.toBeTruthy();
  });

  it("stops once the account has spent its lifetime free runs", async () => {
    const user = await createUser();
    const projects = [];
    for (let i = 0; i <= FREE_LIFETIME_PROJECTS; i += 1) {
      projects.push(await createProject(user.id, { title: `Project ${i}` }));
    }

    for (let i = 0; i < FREE_LIFETIME_PROJECTS; i += 1) {
      await recordRuns(user.id, projects[i]!.id, 1);
    }

    // A fresh project with no runs of its own, refused on the account bound.
    await expect(assertCanGenerate(user, projects.at(-1)!.id)).rejects.toThrow(
      /free project limit reached/i,
    );
  });

  it("does not return a free run when the project is soft-deleted", async () => {
    /*
     * The route a student actually has. Delete is soft and the active-project
     * cap counts only undeleted projects, so without a per-account bound this
     * is delete-and-recreate for unlimited free chapters.
     */
    const user = await createUser();
    const first = await createProject(user.id, { title: "First" });
    const second = await createProject(user.id, { title: "Second" });
    await recordRuns(user.id, first.id, 1);
    await recordRuns(user.id, second.id, 1);

    const replacement = await createProject(user.id, { title: "Replacement" });
    await db.project.update({
      where: { id: first.id },
      data: { deletedAt: new Date() },
    });

    expect(await freeProjectsGenerated(user.id)).toBe(FREE_LIFETIME_PROJECTS);
    await expect(assertCanGenerate(user, replacement.id)).rejects.toThrow(
      /free project limit reached/i,
    );
  });

  it("does not return a free run when the project row is destroyed outright", async () => {
    /*
     * Why the counter is a UsageRecord and not a GenerationJob.
     *
     * No code path hard-deletes a project, so both counters would pass the
     * soft-delete test above. This deletes the row outright — the way someone
     * clearing up in a database console does, which is not hypothetical: the
     * first real account this ran against had four generated projects whose
     * rows were gone exactly that way. Every generation job cascaded with
     * them, so a counter derived from those reads zero here and hands the
     * account its free projects back, with nothing looking broken.
     */
    const user = await createUser();
    const first = await createProject(user.id, { title: "First" });
    const second = await createProject(user.id, { title: "Second" });
    await recordRuns(user.id, first.id, 1);
    await recordRuns(user.id, second.id, 1);

    const replacement = await createProject(user.id, { title: "Replacement" });
    await db.project.delete({ where: { id: first.id } });

    // The jobs really are gone; only the usage ledger is left.
    expect(await db.generationJob.count({ where: { project: { userId: user.id } } })).toBe(1);
    expect(await freeProjectsGenerated(user.id)).toBe(FREE_LIFETIME_PROJECTS);
    await expect(assertCanGenerate(user, replacement.id)).rejects.toThrow(
      /free project limit reached/i,
    );
  });

  it("counts one project as one, however many model calls it took", async () => {
    /*
     * The bug this was written for, found on a real dashboard reading
     * "89 of 2".
     *
     * The pipeline writes an AI_GENERATION usage row per model call, and a run
     * makes roughly twenty-five of them. Counting rows made one generated
     * project look like eighty-nine spent allowances, so a student who had
     * written a single free project was locked out of their second.
     */
    const user = await createUser();
    const project = await createProject(user.id);

    for (let i = 0; i < 25; i += 1) {
      await db.usageRecord.create({
        data: {
          userId: user.id,
          projectId: project.id,
          kind: "AI_GENERATION",
          quantity: 4_000,
          metadata: { model: "claude-opus-5" },
        },
      });
    }

    expect(await freeProjectsGenerated(user.id)).toBe(1);

    // And a second project is still within the allowance.
    const second = await createProject(user.id, { title: "Second" });
    await expect(assertCanGenerate(user, second.id)).resolves.toBeTruthy();
  });

  it("ignores usage rows that belong to no project", async () => {
    // `notIn` with an empty list is optimised away, which would otherwise let a
    // null-project row group into a phantom free project.
    const user = await createUser();
    await db.usageRecord.create({
      data: { userId: user.id, kind: "AI_GENERATION", metadata: {} },
    });

    expect(await freeProjectsGenerated(user.id)).toBe(0);
  });

  it("returns a free run to a project that was later paid for", async () => {
    // A student who buys a pass for the project they trialled should not be
    // left worse off than one who did not. Farming this costs a pass.
    const user = await createUser();
    const trial = await createProject(user.id, { title: "Trial" });
    await recordRuns(user.id, trial.id, 1);

    expect(await freeProjectsGenerated(user.id)).toBe(1);

    await grantPass(user.id);
    await claimPass(user.id, trial.id);

    expect(await freeProjectsGenerated(user.id)).toBe(0);
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
