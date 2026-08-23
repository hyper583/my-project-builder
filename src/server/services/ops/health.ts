import { prisma } from "@/server/db";

/**
 * Operational health of the generation queue.
 *
 * The point of this module is that "nothing is happening" has several distinct
 * causes which look identical from outside and need completely different fixes.
 * A console that reported them all as "stuck" would tell an operator nothing
 * they could act on.
 *
 * The classification is deliberately exhaustive over the ways a job can stop
 * making progress, including the one introduced by pinning jobs to a provider:
 * a job whose provider has no worker will wait forever, and there is no error
 * anywhere to find, because nothing failed.
 */

/** A job is considered abandoned once its worker stops sending heartbeats. */
const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000;

/** A worker is considered online if it polled recently. It polls every 2s. */
const WORKER_ONLINE_MS = 30 * 1000;

export type JobAilment =
  /** Retries exhausted and marked failed. Requeue to try again. */
  | "failed"
  /**
   * Queued, but `attempts` has already reached `maxAttempts`, so the claim
   * query can never select it. Invisible without this check: the status says
   * QUEUED, which looks healthy.
   */
  | "exhausted"
  /** Was RUNNING when its worker died. Reclaimable, if a worker is polling. */
  | "abandoned"
  /**
   * Queued for a provider that has no worker running. Working as designed —
   * provider pinning is what stops a stale worker corrupting a real project —
   * but it means waiting forever unless someone starts the right worker.
   */
  | "orphaned"
  /** Queued, claimable, but nothing at all is polling. */
  | "unattended";

export interface AilingJob {
  readonly id: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly provider: string;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly ailment: JobAilment;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly lastProgressAt: Date | null;
  /** True when requeueing is the correct remedy rather than starting a worker. */
  readonly requeueable: boolean;
}

export interface WorkerStatus {
  readonly id: string;
  readonly provider: string;
  readonly lastSeen: Date;
  readonly startedAt: Date;
  readonly online: boolean;
}

/** Which workers have checked in, and whether they are still doing so. */
export async function listWorkers(): Promise<WorkerStatus[]> {
  const rows = await prisma.workerHeartbeat.findMany({ orderBy: { lastSeen: "desc" } });
  const cutoff = Date.now() - WORKER_ONLINE_MS;

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    lastSeen: row.lastSeen,
    startedAt: row.startedAt,
    online: row.lastSeen.getTime() >= cutoff,
  }));
}

/**
 * Every job that has stopped making progress, with the reason.
 *
 * Healthy jobs are not returned. A console listing everything would need to be
 * read to find the problems; this one is empty when there are none, which is
 * the state an operator should be able to recognise at a glance.
 */
export async function listAilingJobs(limit = 50): Promise<AilingJob[]> {
  const staleBefore = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  const [jobs, workers] = await Promise.all([
    prisma.generationJob.findMany({
      where: { status: { in: ["QUEUED", "RUNNING", "FAILED"] } },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        projectId: true,
        provider: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        error: true,
        createdAt: true,
        heartbeat: true,
        startedAt: true,
        project: { select: { title: true } },
      },
    }),
    listWorkers(),
  ]);

  const providersOnline = new Set(workers.filter((w) => w.online).map((w) => w.provider));
  const anyWorkerOnline = providersOnline.size > 0;

  const ailing: AilingJob[] = [];

  for (const job of jobs) {
    const ailment = classify({
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      heartbeat: job.heartbeat,
      staleBefore,
      provider: job.provider,
      providersOnline,
      anyWorkerOnline,
    });

    if (!ailment) continue;

    ailing.push({
      id: job.id,
      projectId: job.projectId,
      projectTitle: job.project.title,
      provider: job.provider,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      ailment,
      error: job.error,
      createdAt: job.createdAt,
      lastProgressAt: job.heartbeat ?? job.startedAt,
      // Starting a worker is the fix for the other two; requeueing an orphaned
      // or unattended job would just put it back in the same queue.
      requeueable: ailment === "failed" || ailment === "exhausted" || ailment === "abandoned",
    });
  }

  return ailing;
}

function classify(input: {
  status: string;
  attempts: number;
  maxAttempts: number;
  heartbeat: Date | null;
  staleBefore: Date;
  provider: string;
  providersOnline: ReadonlySet<string>;
  anyWorkerOnline: boolean;
}): JobAilment | null {
  if (input.status === "FAILED") return "failed";

  if (input.status === "RUNNING") {
    // A live heartbeat means it is working, however long it has been going —
    // a chapter can legitimately take minutes.
    const beat = input.heartbeat;
    return beat && beat < input.staleBefore ? "abandoned" : null;
  }

  // QUEUED from here down.

  // Checked before the worker questions: a job nothing can claim is stuck for
  // its own reason, and starting a worker would not help it.
  if (input.attempts >= input.maxAttempts) return "exhausted";

  // An empty provider predates the column and is deliberately unclaimable.
  if (!input.provider || !input.providersOnline.has(input.provider)) {
    return input.anyWorkerOnline ? "orphaned" : "unattended";
  }

  return null;
}

/** Plain-English remedy, so the console says what to do rather than only what is wrong. */
export const AILMENT_REMEDY: Record<JobAilment, string> = {
  failed: "Retries were exhausted. Requeue to try again.",
  exhausted: "Queued but out of attempts, so no worker can ever claim it. Requeue to reset.",
  abandoned: "Its worker stopped responding. Requeue, or wait for another worker to reclaim it.",
  orphaned: "No worker is running this job's provider. Start one, or requeue it elsewhere.",
  unattended: "No workers are running at all. Start the worker process.",
};
