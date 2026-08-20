import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * Prisma 7 requires a driver adapter — there is no built-in engine connection.
 * The adapter uses DATABASE_URL (which may be the pooled connection); the
 * Prisma CLI uses DIRECT_URL via prisma.config.ts.
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      // Only constrained when explicitly configured — see DATABASE_POOL_MAX.
      ...(env.DATABASE_POOL_MAX ? { max: env.DATABASE_POOL_MAX } : {}),
    }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Preserve the client across hot reloads in development so we do not exhaust
// the connection pool.
if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
