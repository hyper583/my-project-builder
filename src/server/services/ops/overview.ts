import { prisma } from "@/server/db";

/**
 * The console's summary numbers.
 *
 * Every figure here is a count of rows that exist. There is no AI spend, no
 * projected revenue and no growth rate, because none of those can be derived
 * from what is recorded — cost per token is not stored anywhere. In a product
 * whose entire premise is not inventing numbers, a plausible-looking chart
 * assembled from assumptions would be the worst possible thing to put on the
 * operator's first screen.
 *
 * Where a number could mislead, the shape of it is returned rather than a
 * single figure: "12 runs, 2 of which failed" is actionable in a way that a
 * success percentage is not, particularly at small n.
 */

const WINDOW_DAYS = 30;

export interface Overview {
  readonly windowDays: number;
  readonly people: {
    readonly total: number;
    readonly suspended: number;
    readonly admins: number;
    readonly paid: number;
    readonly newThisWindow: number;
  };
  readonly projects: {
    readonly total: number;
    readonly real: number;
    readonly demo: number;
    readonly deleted: number;
    readonly generating: number;
    readonly ready: number;
    readonly newThisWindow: number;
  };
  readonly generation: {
    readonly runs: number;
    readonly succeeded: number;
    readonly failed: number;
    readonly inFlight: number;
  };
  readonly work: {
    /** Tokens across generation and editing. Counted, never priced. */
    readonly tokens: number;
    readonly exports: number;
    readonly storageBytes: number;
    readonly unresolvedPlaceholders: number;
  };
  readonly faults: number;
}

export async function getOverview(): Promise<Overview> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000);
  const live = { deletedAt: null };

  const [
    people,
    suspended,
    admins,
    paid,
    newPeople,
    projects,
    real,
    demo,
    deleted,
    generating,
    ready,
    newProjects,
    runs,
    succeeded,
    failed,
    inFlight,
    tokens,
    exports,
    storage,
    placeholders,
    faults,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.count({ where: { role: "ADMIN", suspendedAt: null } }),
    prisma.user.count({ where: { planTier: "PAID" } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),

    prisma.project.count({ where: live }),
    prisma.project.count({ where: { ...live, kind: "REAL" } }),
    prisma.project.count({ where: { ...live, kind: "DEMO" } }),
    prisma.project.count({ where: { deletedAt: { not: null } } }),
    prisma.project.count({ where: { ...live, status: "GENERATING" } }),
    prisma.project.count({ where: { ...live, status: "READY" } }),
    prisma.project.count({ where: { ...live, createdAt: { gte: since } } }),

    prisma.generationJob.count({ where: { createdAt: { gte: since } } }),
    prisma.generationJob.count({ where: { createdAt: { gte: since }, status: "SUCCEEDED" } }),
    prisma.generationJob.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
    prisma.generationJob.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),

    prisma.usageRecord.aggregate({
      where: { createdAt: { gte: since }, kind: { in: ["AI_GENERATION", "AI_EDIT"] } },
      _sum: { quantity: true },
    }),
    prisma.export.count({ where: { createdAt: { gte: since } } }),
    prisma.projectDocument.aggregate({ _sum: { sizeBytes: true } }),
    // The honest measure of how much of the corpus still needs its authors.
    prisma.sectionPlaceholder.count({ where: { resolved: false } }),
    prisma.errorLog.count({ where: { createdAt: { gte: since } } }),
  ]);

  return {
    windowDays: WINDOW_DAYS,
    people: { total: people, suspended, admins, paid, newThisWindow: newPeople },
    projects: {
      total: projects,
      real,
      demo,
      deleted,
      generating,
      ready,
      newThisWindow: newProjects,
    },
    generation: { runs, succeeded, failed, inFlight },
    work: {
      tokens: tokens._sum.quantity ?? 0,
      exports,
      storageBytes: storage._sum.sizeBytes ?? 0,
      unresolvedPlaceholders: placeholders,
    },
    faults,
  };
}
