import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * There is no Redis in this stack, and a per-instance in-memory counter would
 * not hold across serverless invocations. A unique index on
 * (identity, bucket, windowStart) makes the increment atomic: concurrent
 * requests either create the row or collide and fall through to an update.
 */
export async function checkRateLimit(
  identity: string,
  max: number,
  windowSeconds: number,
): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const record = await prisma.rateLimit.upsert({
    where: { identity_bucket_windowStart: { identity, bucket: String(windowSeconds), windowStart } },
    create: { identity, bucket: String(windowSeconds), windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  if (record.count > max) {
    throw new AppError("RATE_LIMITED", {
      message: `${identity} exceeded ${max} per ${windowSeconds}s`,
    });
  }
}

/** Housekeeping for old windows. Safe to call from any scheduled job. */
export async function pruneRateLimits(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000);
  const { count } = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return count;
}
