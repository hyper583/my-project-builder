import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import { claimNextJob, enqueueGeneration } from "@/server/services/jobs/queue";

/**
 * The generation queue's provider pinning.
 *
 * These exist because of a real incident. A run failed on a billing error and
 * released its job for retry; a worker left running from the previous day —
 * still holding the AI_PROVIDER its process had loaded at startup — claimed the
 * retry, wrote placeholder prose into a REAL project, and the job reported
 * SUCCEEDED. Seventeen sections of a student's project filled with text
 * announcing that no AI provider was configured.
 *
 * Nothing in the schema had tied a job to the provider meant to run it. These
 * tests hold that seam shut, on the claim side. The pipeline carries a second
 * lock on the side that actually writes to the project.
 */

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

/** A project with one chapter, so the stage graph has something to build. */
async function seedProject(kind: "REAL" | "DEMO" = "REAL") {
  const user = await createUser();
  const project = await createProject(user.id, { kind, title: "Queue check" });
  await db.projectSection.create({
    data: { projectId: project.id, parentId: null, number: "1", title: "Introduction", order: 1 },
  });
  return project;
}

describe("provider pinning", () => {
  it("records the provider that queued the job", async () => {
    const project = await seedProject();
    const jobId = await enqueueGeneration(project.id);

    const job = await db.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    // The test environment runs the mock provider; the point is that whatever
    // queued the job is written down rather than left implicit.
    expect(job.provider).toBe("mock");
    expect(job.provider).not.toBe("");
  });

  it("lets a worker on the same provider claim the job", async () => {
    const project = await seedProject();
    const jobId = await enqueueGeneration(project.id);

    const claimed = await claimNextJob("worker-a", "mock");

    expect(claimed?.id).toBe(jobId);
    expect(claimed?.provider).toBe("mock");
  });

  it("refuses a worker running a different provider", async () => {
    const project = await seedProject();
    await enqueueGeneration(project.id);

    // This is the incident, reproduced: a worker holding a different provider
    // asks for work while a job for another one is queued.
    const claimed = await claimNextJob("stale-worker", "anthropic");

    expect(claimed).toBeNull();
  });

  it("leaves the job claimable by the right worker afterwards", async () => {
    const project = await seedProject();
    const jobId = await enqueueGeneration(project.id);

    // A refusal must not consume an attempt or lock the row — otherwise a
    // mismatched worker polling in a loop would burn the job's retries.
    await claimNextJob("stale-worker", "anthropic");
    const claimed = await claimNextJob("worker-a", "mock");

    expect(claimed?.id).toBe(jobId);
    expect(claimed?.attempts).toBe(1);
  });

  it("does not let a mismatched worker take over a released retry", async () => {
    const project = await seedProject();
    const jobId = await enqueueGeneration(project.id);

    // Claim, then release the way `failJob` does when retries remain.
    await claimNextJob("worker-a", "mock");
    await db.generationJob.update({
      where: { id: jobId },
      data: { status: "QUEUED", lockedBy: null, heartbeat: null, error: "billing" },
    });

    // The reclaim path is exactly where the incident happened.
    expect(await claimNextJob("stale-worker", "anthropic")).toBeNull();
    expect((await claimNextJob("worker-a", "mock"))?.id).toBe(jobId);
  });

  it("never claims a job queued before the provider column existed", async () => {
    const project = await seedProject();
    const jobId = await enqueueGeneration(project.id);
    // The migration default. Such a job's provider is unknowable, so no worker
    // should resurrect it rather than one guessing.
    await db.generationJob.update({ where: { id: jobId }, data: { provider: "" } });

    expect(await claimNextJob("worker-a", "mock")).toBeNull();
    expect(await claimNextJob("worker-b", "anthropic")).toBeNull();
  });
});

describe("enqueueing", () => {
  it("refuses a second run while one is active", async () => {
    const project = await seedProject();
    await enqueueGeneration(project.id);

    // A double-clicked Generate button must not put two workers on the same
    // sections.
    await expect(enqueueGeneration(project.id)).rejects.toThrow(/already in progress/i);
  });

  it("builds one stage per chapter around the fixed prologue and epilogue", async () => {
    const project = await seedProject();
    await db.projectSection.create({
      data: { projectId: project.id, parentId: null, number: "2", title: "Methodology", order: 2 },
    });

    const jobId = await enqueueGeneration(project.id);
    const steps = await db.generationStep.findMany({
      where: { jobId },
      orderBy: { order: "asc" },
      select: { key: true },
    });

    // Retrieval sits in the prologue, ahead of the writing. It used to run
    // after the last chapter, which meant every chapter was written before a
    // single source existed and the citations in the prose referred to
    // nothing. Consistency stays at the end, where there is something to
    // check.
    expect(steps.map((s) => s.key.split(":")[0])).toEqual([
      "analyse",
      "references",
      "outline",
      "chapter",
      "chapter",
      "consistency",
      "finalise",
    ]);
  });
});

describe("a project with nothing to write", () => {
  it("is refused rather than run to a green finish", async () => {
    const user = await createUser();
    const project = await createProject(user.id, { title: "No structure" });

    // No chapters. `buildStages([])` would yield only the prologue and
    // epilogue: every stage succeeds, the project is marked READY, and not a
    // word exists — having spent one of the runs the plan allows.
    await expect(enqueueGeneration(project.id)).rejects.toThrow();
    expect(await db.generationJob.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("says which step fixes it", async () => {
    const user = await createUser();
    const project = await createProject(user.id, { title: "No structure" });

    // The message reaches a student through the blueprint's error region, so
    // it has to name the thing they should do next.
    await expect(enqueueGeneration(project.id)).rejects.toThrow(/no chapters/i);
  });

  it("leaves the project's status alone when it refuses", async () => {
    const user = await createUser();
    const project = await createProject(user.id, { title: "No structure" });

    await enqueueGeneration(project.id).catch(() => {});

    // A refusal must not leave it stuck showing GENERATING forever.
    const after = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.status).not.toBe("GENERATING");
  });
});
