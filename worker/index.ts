import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

/**
 * Generation worker.
 *
 * Runs as a separate process from the Next server, which is the whole point:
 * generation must not depend on a browser request staying open. The student can
 * close the tab, lose their connection, or come back tomorrow — the worker
 * carries on and the progress rows it writes are what the UI reads.
 *
 *   npm run worker
 *
 * Several workers can run at once. Job claiming uses FOR UPDATE SKIP LOCKED, so
 * they never collide over the same job.
 */

const POLL_INTERVAL_MS = 2000;
const IDLE_LOG_EVERY = 30; // ~1 minute of silence between idle log lines

async function main(): Promise<void> {
  // Imported after dotenv so env validation sees the loaded values.
  const { claimNextJob, newWorkerId } = await import("@/server/services/jobs/queue");
  const { runGenerationJob } = await import("@/server/services/jobs/pipeline");
  const { ai } = await import("@/server/services/ai");
  const { prisma } = await import("@/server/db");

  const workerId = newWorkerId();
  let stopping = false;
  let idleTicks = 0;

  console.info(`[worker ${workerId}] started — AI provider: ${ai.name}`);
  if (!ai.isConfigured) {
    console.warn(
      `[worker ${workerId}] no AI provider configured; jobs will produce clearly-marked mock output`,
    );
  }

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`[worker ${workerId}] ${signal} received — finishing current job then exiting`);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (!stopping) {
    let job = null;
    try {
      job = await claimNextJob(workerId);
    } catch (error) {
      // A database blip must not kill the worker — back off and try again.
      console.error(`[worker ${workerId}] claim failed:`, error);
      await sleep(POLL_INTERVAL_MS * 5);
      continue;
    }

    if (!job) {
      idleTicks += 1;
      if (idleTicks % IDLE_LOG_EVERY === 0) {
        console.info(`[worker ${workerId}] idle, waiting for jobs`);
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    idleTicks = 0;
    console.info(
      `[worker ${workerId}] claimed job ${job.id} (project ${job.projectId}, attempt ${job.attempts}/${job.maxAttempts})`,
    );

    const startedAt = Date.now();
    // runGenerationJob records its own failures against the job row, so a
    // throw here would be a bug in the recorder itself — log and keep serving.
    try {
      await runGenerationJob(job);
      console.info(
        `[worker ${workerId}] finished job ${job.id} in ${Math.round((Date.now() - startedAt) / 1000)}s`,
      );
    } catch (error) {
      console.error(`[worker ${workerId}] unhandled error on job ${job.id}:`, error);
    }
  }

  await prisma.$disconnect();
  console.info(`[worker ${workerId}] stopped`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[worker] fatal:", error);
  process.exit(1);
});
