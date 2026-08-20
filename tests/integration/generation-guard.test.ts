import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import { enqueueGeneration } from "@/server/services/jobs/queue";
import { runGenerationJob } from "@/server/services/jobs/pipeline";

/**
 * The pipeline's refusal to write placeholder prose into a real project.
 *
 * The mock provider emits clearly-marked text saying no AI provider is
 * configured. That is right for a development server with no key. It is not
 * right in a student's actual project, where it lands in the sections their
 * draft should occupy — and, before this guard, the job reported SUCCEEDED
 * over the top of it.
 *
 * The queue's provider pinning is the first lock. This is the second, on the
 * side that actually writes, because the two failure modes are different: the
 * queue stops the wrong worker taking the job, and this stops any worker that
 * cannot really generate from touching a real project at all.
 *
 * `tests/setup.ts` forces the mock provider, so `ai.isConfigured` is false
 * throughout this file — which is exactly the condition under test.
 */

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

async function seedProject(kind: "REAL" | "DEMO") {
  const user = await createUser();
  const project = await createProject(user.id, { kind, title: `${kind} project` });
  const chapter = await db.projectSection.create({
    data: { projectId: project.id, parentId: null, number: "1", title: "Introduction", order: 1 },
  });
  await db.projectSection.create({
    data: {
      projectId: project.id,
      parentId: chapter.id,
      number: "1.1",
      title: "Background to the Study",
      order: 1,
    },
  });
  return project;
}

/** Runs the job the way a worker would, with the row the queue hands back. */
async function runFor(projectId: string) {
  const jobId = await enqueueGeneration(projectId);
  const job = await db.generationJob.findUniqueOrThrow({ where: { id: jobId } });
  await runGenerationJob({
    id: job.id,
    projectId: job.projectId,
    attempts: 1,
    maxAttempts: job.maxAttempts,
    provider: job.provider,
  });
  return jobId;
}

describe("a real project on an unconfigured provider", () => {
  it("fails the job rather than reporting success", async () => {
    const project = await seedProject("REAL");
    const jobId = await runFor(project.id);

    const job = await db.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    // The whole point: a run that cannot generate must not come back green.
    expect(job.status).not.toBe("SUCCEEDED");
    expect(job.error ?? "").toMatch(/placeholder text|refusing/i);
  });

  it("writes nothing into the student's sections", async () => {
    const project = await seedProject("REAL");
    await runFor(project.id);

    const sections = await db.projectSection.findMany({
      where: { projectId: project.id, parentId: { not: null } },
      select: { content: true },
    });

    // Seventeen sections of a real project were filled with placeholder prose
    // before this guard existed. Not one may be touched now.
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.content ?? "").toBe("");
    }
  });

  it("leaves the project out of the generating state", async () => {
    const project = await seedProject("REAL");
    await runFor(project.id);

    const after = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    // A project stuck showing "Generating" forever is its own bug.
    expect(after.status).not.toBe("GENERATING");
  });

  it("says what to do about it", async () => {
    const project = await seedProject("REAL");
    const jobId = await runFor(project.id);

    const job = await db.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    // The message reaches a student through the progress UI, so it has to be
    // an instruction rather than a stack trace.
    expect(job.error ?? "").toMatch(/configure an AI provider/i);
  });
});

describe("a demo project on an unconfigured provider", () => {
  it("is still allowed to run", async () => {
    const project = await seedProject("DEMO");
    const jobId = await runFor(project.id);

    const job = await db.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    // A sample project is explicitly illustrative and is marked as such
    // wherever it surfaces, so mock output there misleads nobody. Blocking it
    // would also make the pipeline untestable without a key.
    expect(job.error ?? "").not.toMatch(/refusing/i);
  });
});
