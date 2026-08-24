import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db";
import { ai } from "@/server/services/ai";
import { AppError } from "@/server/errors";
import { buildStages } from "@/server/services/jobs/stages";

/**
 * Postgres-backed job queue.
 *
 * There is no Redis in this stack, and generation must survive the student
 * closing the tab — so jobs live in the database and a separate worker process
 * claims them. Claiming uses `FOR UPDATE SKIP LOCKED`, which lets several
 * workers run concurrently without ever handing the same job to two of them.
 *
 * Progress the UI displays is read from these rows, so it always reflects real
 * backend state rather than an animation.
 */

/** A job is considered abandoned if its worker stops sending heartbeats. */
const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000;

export interface ClaimedJob {
  id: string;
  projectId: string;
  attempts: number;
  maxAttempts: number;
  provider: string;
}

/**
 * Queues a generation run for a project.
 *
 * Refuses to queue a second run while one is active — the brief requires that
 * duplicate generation be impossible, and a student double-clicking "Generate"
 * must not produce two workers writing the same sections.
 *
 * `maxChapters` is the paywall, and this is the only place it can be enforced
 * honestly. The steps written here are what the worker executes, they live in
 * the database, and nothing the browser sends can add to them — so a chapter
 * with no step is a chapter that cannot be written, rather than one that is
 * merely hidden after the fact.
 */
export async function enqueueGeneration(
  projectId: string,
  options: { maxChapters?: number } = {},
): Promise<string> {
  const maxChapters = options.maxChapters ?? Number.POSITIVE_INFINITY;

  const active = await prisma.generationJob.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  if (active) {
    throw new AppError("CONFLICT", {
      message: `Generation already in progress for project ${projectId}`,
    });
  }

  // Stages are derived from the project's own chapters, so a three-chapter or
  // seven-chapter project produces the right steps rather than being forced
  // into a five-chapter assumption.
  const chapters = await prisma.projectSection.findMany({
    where: { projectId, parentId: null },
    orderBy: { order: "asc" },
    select: { id: true, number: true, title: true },
  });

  /*
   * A project with no chapters has nothing to write.
   *
   * Without this the run is quietly pointless: `buildStages([])` yields only
   * the prologue and epilogue, every one of those stages succeeds, the project
   * is marked READY, and not a word exists. The student opens a finished-looking
   * project and finds it empty — having spent one of the generation runs their
   * plan allows.
   *
   * Refusing here is the honest outcome, and it names the step that fixes it.
   */
  if (chapters.length === 0) {
    throw new AppError("VALIDATION", {
      message: `Project ${projectId} has no chapters to generate`,
      userMessage:
        "This project has no chapters yet, so there is nothing to write. " +
        "Choose a chapter structure in setup first.",
    });
  }

  /*
   * Which chapters this run actually writes.
   *
   * Already-written chapters are skipped rather than rewritten, which is what
   * makes "Generate" mean "continue" after a pass is bought: Chapter 1 was
   * written on the free run, so the paid run picks up at Chapter 2 and leaves
   * the student's edits to Chapter 1 alone. It also stops a run being spent
   * reproducing prose the student already read and accepted.
   *
   * `wordCount` is the test rather than `content`, because it is maintained by
   * both the pipeline and the editor's save action and can be asked for without
   * reading a single word of the prose itself.
   */
  const written = await prisma.projectSection.findMany({
    where: { projectId, wordCount: { gt: 0 } },
    select: { id: true, parentId: true },
  });
  // A section's chapter is its parent; a chapter with prose of its own is
  // itself. Both mark the chapter as done.
  const writtenChapters = new Set(written.map((section) => section.parentId ?? section.id));

  /*
   * The allowance is a window over the FRONT of the project, not a count of
   * whatever happens to be unwritten.
   *
   * Taking the first N unwritten chapters instead was the first attempt and it
   * was wrong in a way worth recording: once Chapter 1 had been written, a free
   * run's one chapter became Chapter 2 — the allowance walked forward through
   * the project rather than staying put. Anchoring it to the start is also what
   * makes this agree with the workspace, which locks by position, so the
   * chapters that cannot be written are exactly the ones that cannot be read.
   */
  const allowed = Number.isFinite(maxChapters) ? chapters.slice(0, maxChapters) : chapters;
  const toWrite = allowed.filter((chapter) => !writtenChapters.has(chapter.id));

  /*
   * Nothing left to write.
   *
   * Reached when every chapter the allowance covers already has prose. Queuing
   * anyway would run the prologue and epilogue, succeed, change nothing, and
   * charge the student a run for it — the same failure the no-chapters guard
   * above exists to prevent, arrived at from the other direction.
   *
   * The two cases need different answers. A free project with chapters beyond
   * its window is not finished, and telling a student it is would be a lie.
   */
  if (toWrite.length === 0) {
    const beyondAllowance = chapters.length > allowed.length;
    throw new AppError("VALIDATION", {
      message: `Project ${projectId} has no unwritten chapters within its allowance`,
      userMessage: beyondAllowance
        ? "Every chapter your free project includes has been written. A project pass " +
          "writes the rest."
        : "Every chapter in this project has already been written. Edit them here, or " +
          "clear a chapter first if you want it drafted again.",
    });
  }

  const stages = buildStages(toWrite);

  const job = await prisma.generationJob.create({
    data: {
      projectId,
      status: "QUEUED",
      // Pinned at enqueue so only a worker running this same provider can
      // claim it. See `claimNextJob`.
      provider: ai.name,
      steps: {
        create: stages.map((stage, index) => ({
          order: index,
          key: stage.key,
          label: stage.label,
          status: "QUEUED",
        })),
      },
    },
    select: { id: true },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "GENERATING" },
  });

  return job.id;
}

/**
 * Atomically claims one runnable job.
 *
 * `SKIP LOCKED` means a worker never blocks waiting for a row another worker
 * already holds — it simply takes the next available job. The same statement
 * also reclaims jobs whose worker died mid-run (stale heartbeat), which is what
 * makes the queue recover from a crashed process rather than stalling.
 *
 * The `provider` match is a safety property, not an optimisation. A worker
 * loads AI_PROVIDER once at startup, so one left running from an earlier
 * session keeps whatever it booted with. Without this clause such a worker can
 * claim a job queued for a different provider — including the reclaim path
 * above, which is how it happened here: a real run failed on a billing error,
 * released the job, and a mock worker from the previous day took the retry and
 * wrote placeholder text into a REAL project. The job then reported SUCCEEDED.
 *
 * Jobs queued before this column existed carry an empty provider and are
 * therefore never claimable, which is the correct outcome — nothing should
 * resurrect a run whose provider is unknown.
 */
export async function claimNextJob(
  workerId: string,
  /** Only jobs queued for this provider are eligible. */
  provider: string,
): Promise<ClaimedJob | null> {
  const staleBefore = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      projectId: string;
      attempts: number;
      maxAttempts: number;
      provider: string;
    }>
  >`
    WITH claimed AS (
      SELECT id
      FROM generation_job
      WHERE (
              status = 'QUEUED'
              OR (status = 'RUNNING' AND ("heartbeat" IS NULL OR "heartbeat" < ${staleBefore}))
            )
        AND attempts < "maxAttempts"
        AND provider = ${provider}
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE generation_job j
    SET status     = 'RUNNING',
        attempts   = j.attempts + 1,
        "lockedAt" = now(),
        "lockedBy" = ${workerId},
        "heartbeat"= now(),
        "startedAt"= COALESCE(j."startedAt", now()),
        "updatedAt"= now()
    FROM claimed
    WHERE j.id = claimed.id
    RETURNING j.id, j."projectId" AS "projectId", j.attempts, j."maxAttempts" AS "maxAttempts",
              j.provider
  `;

  return rows[0] ?? null;
}

/** Keeps a running job from being reclaimed as abandoned. */
export async function heartbeat(jobId: string): Promise<void> {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { heartbeat: new Date() },
  });
}

export async function startStep(jobId: string, key: string): Promise<void> {
  await prisma.generationStep.updateMany({
    where: { jobId, key },
    data: { status: "RUNNING", startedAt: new Date(), error: null },
  });
}

export async function completeStep(jobId: string, key: string): Promise<void> {
  await prisma.generationStep.updateMany({
    where: { jobId, key },
    data: { status: "SUCCEEDED", completedAt: new Date() },
  });
}

export async function failStep(jobId: string, key: string, message: string): Promise<void> {
  await prisma.generationStep.updateMany({
    where: { jobId, key },
    data: { status: "FAILED", completedAt: new Date(), error: message.slice(0, 2000) },
  });
}

export async function completeJob(jobId: string, projectId: string): Promise<void> {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED", completedAt: new Date(), error: null },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "READY" },
  });
}

/**
 * Records a failure.
 *
 * A job with retries left goes back to QUEUED so another worker picks it up —
 * completed steps are left SUCCEEDED, so the retry resumes rather than
 * restarting. Only when retries are exhausted does the project leave the
 * GENERATING state, and its finished sections are never discarded.
 *
 * `retryable: false` ends the job on the spot. Some failures cannot be fixed by
 * running the same thing again — a deleted project, or a provider that is not
 * configured — and retrying those three times only leaves the project sitting
 * in GENERATING while the outcome is already known.
 */
export async function failJob(
  jobId: string,
  projectId: string,
  message: string,
  options: { retryable?: boolean } = {},
): Promise<{ willRetry: boolean }> {
  const job = await prisma.generationJob.findUniqueOrThrow({
    where: { id: jobId },
    select: { attempts: true, maxAttempts: true },
  });

  const willRetry = options.retryable !== false && job.attempts < job.maxAttempts;

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: willRetry ? "QUEUED" : "FAILED",
      error: message.slice(0, 2000),
      lockedBy: null,
      heartbeat: null,
      ...(willRetry ? {} : { completedAt: new Date() }),
    },
  });

  if (!willRetry) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "DRAFT" },
    });
  }

  return { willRetry };
}

/**
 * Announces that this worker is alive and which provider it runs.
 *
 * Called on every poll, which is what lets the admin console tell "this job is
 * stuck" apart from "nothing is running that could take it" — two states that
 * are indistinguishable from the job row alone and need opposite fixes.
 *
 * Rows are never deleted when a worker exits. A worker that stopped is exactly
 * the case worth seeing; a stale `lastSeen` is the signal, and deleting it
 * would erase the evidence.
 */
export async function announceWorker(workerId: string, provider: string): Promise<void> {
  try {
    await prisma.workerHeartbeat.upsert({
      where: { id: workerId },
      create: { id: workerId, provider },
      // `lastSeen` is @updatedAt, so it moves on any write.
      update: { provider },
    });
  } catch {
    // A worker must keep serving jobs even if it cannot announce itself. The
    // console showing one fewer worker is a far smaller problem than the queue
    // stopping.
  }
}

export function newWorkerId(): string {
  return `${process.pid}-${randomUUID().slice(0, 8)}`;
}
