import { JobHealth, RecentErrors, Workers, type ErrorRow } from "@/components/admin/ops-panels";
import { entitlementsFor, type PlanTier } from "@/config/plans";
import { requireAdmin } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AILMENT_REMEDY, listAilingJobs, listWorkers } from "@/server/services/ops/health";

/** Never cached: a monitoring view showing stale state is worse than none. */
export const dynamic = "force-dynamic";

/** Start of the rolling 30-day window plan limits are counted over. */
function windowStart(): Date {
  return new Date(Date.now() - 30 * 24 * 3600_000);
}

/**
 * Operations.
 *
 * Every figure here reads a column that exists. There is no "AI spend" chart,
 * because cost per token is not recorded anywhere — token counts are, so token
 * counts are what it reports. A plausible-looking cost graph would be a
 * fabricated number in a product whose whole premise is not producing them.
 */
export default async function AdminOpsPage() {
  await requireAdmin();

  const since = windowStart();

  const [ailing, workers, errors, heaviest] = await Promise.all([
    listAilingJobs(),
    listWorkers(),
    prisma.errorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, code: true, summary: true, origin: true, createdAt: true, detail: true },
    }),
    // Usage against plan limits. Grouped in the database rather than loaded and
    // counted here, so this stays one query as the table grows.
    prisma.usageRecord.groupBy({
      by: ["userId", "kind"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
  ]);

  const errorRows: ErrorRow[] = errors.map((row) => ({
    id: row.id,
    code: row.code,
    summary: row.summary,
    origin: row.origin,
    createdAt: row.createdAt.toISOString(),
    hasDetail: Boolean(row.detail),
  }));

  // Only users who actually did something in the window; a list of everyone at
  // zero would bury the ones worth looking at.
  const userIds = [...new Set(heaviest.map((row) => row.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, planTier: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  const usage = userIds
    .map((id) => {
      const user = byId.get(id);
      const rows = heaviest.filter((row) => row.userId === id);
      const generations = rows.find((r) => r.kind === "AI_GENERATION")?._count._all ?? 0;
      const edits = rows.find((r) => r.kind === "AI_EDIT")?._count._all ?? 0;
      const tokens = rows
        .filter((r) => r.kind === "AI_GENERATION" || r.kind === "AI_EDIT")
        .reduce((total, r) => total + (r._sum.quantity ?? 0), 0);
      const plan = entitlementsFor((user?.planTier ?? "FREE") as PlanTier);
      return {
        id,
        email: user?.email ?? "(deleted user)",
        plan: plan.label,
        generations,
        generationLimit: plan.maxGenerationsPerMonth,
        edits,
        editLimit: plan.maxEditsPerMonth,
        tokens,
        overLimit: generations > plan.maxGenerationsPerMonth || edits > plan.maxEditsPerMonth,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="label-caps">Operations</p>
        <h1 className="mt-2 text-[2rem] leading-none font-semibold tracking-[-0.035em]">
          Generation health
        </h1>
        <p className="mt-2.5 max-w-2xl leading-relaxed text-muted-foreground">
          Everything here reads real state. A job that looks stuck and a job that has
          nothing running to claim it are different problems with different fixes, so they
          are named separately.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">Jobs needing attention</h2>
        <div className="mt-4">
          <JobHealth jobs={ailing} remedies={AILMENT_REMEDY} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">Workers</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A worker only claims jobs queued for its own provider.
        </p>
        <div className="mt-4">
          <Workers workers={workers} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">Recent faults</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Summaries only. Full messages can quote a student&apos;s own text, so revealing one
          is recorded.
        </p>
        <div className="mt-4">
          <RecentErrors errors={errorRows} />
        </div>
      </section>

      <section className="mt-10 pb-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">Usage against limits</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Last 30 days, busiest first.</p>

        {usage.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground elevated-1">
            No AI usage recorded in the last 30 days.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card elevated-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps px-4 py-3 font-medium">User</th>
                  <th className="label-caps px-4 py-3 font-medium">Plan</th>
                  <th className="label-caps px-4 py-3 font-medium">Generations</th>
                  <th className="label-caps px-4 py-3 font-medium">Edits</th>
                  <th className="label-caps px-4 py-3 font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{row.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.plan}</td>
                    <td
                      className={`mono px-4 py-3 ${row.generations > row.generationLimit ? "text-warning" : "text-muted-foreground"}`}
                    >
                      {row.generations}/{row.generationLimit}
                    </td>
                    <td
                      className={`mono px-4 py-3 ${row.edits > row.editLimit ? "text-warning" : "text-muted-foreground"}`}
                    >
                      {row.edits}/{row.editLimit}
                    </td>
                    <td className="mono px-4 py-3 text-muted-foreground">
                      {row.tokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
