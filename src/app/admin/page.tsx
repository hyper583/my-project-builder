import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { CountUp } from "@/components/motion/count-up";
import { requireAdmin } from "@/server/dal/session";
import { getOverview } from "@/server/services/ops/overview";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * A figure and what it means.
 *
 * `detail` is not decoration. A count on its own invites the reader to supply
 * their own denominator, and the wrong one is worse than none.
 */
function Stat({
  label,
  value,
  detail,
  tone = "default",
  href,
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "warning";
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="mt-3">
        <span
          className={`mono-figure text-[2rem] leading-none font-medium ${
            tone === "warning" && value > 0 ? "text-warning" : ""
          }`}
        >
          <CountUp value={value} />
        </span>
        <span className="mt-2 block text-xs text-subtle-foreground">{detail}</span>
      </dd>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="lift lift-scale focus-glow rounded-xl border border-border bg-card p-4 elevated-1 hover:border-border-strong"
      >
        {body}
      </Link>
    );
  }

  return <div className="rounded-xl border border-border bg-card p-4 elevated-1">{body}</div>;
}

/**
 * Overview.
 *
 * Built last of the five sections, deliberately: a summary is only worth
 * anything once the things it summarises exist and are managed somewhere. Built
 * first it would have been charts over data nobody could act on.
 *
 * Every figure counts rows that exist. There is no spend chart, because cost
 * per token is recorded nowhere — and a plausible-looking number assembled from
 * assumptions is exactly what this product exists not to produce.
 */
export default async function AdminOverviewPage() {
  await requireAdmin();
  const data = await getOverview();

  const { people, projects, generation, work, faults, windowDays } = data;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="label-caps">Overview</p>
        <h1 className="mt-2 text-[2rem] leading-none font-semibold tracking-[-0.035em]">
          The whole product
        </h1>
        <p className="mt-2.5 max-w-2xl leading-relaxed text-muted-foreground">
          Counts of things that exist. Rates and totals over the last {windowDays} days where
          a window is meaningful — nothing here is projected, estimated or priced.
        </p>
      </header>

      {/* Faults and stalled work come first: they are the only things on this
          page that might need someone to do something today. */}
      {faults > 0 || generation.failed > 0 ? (
        <Link
          href="/admin/health"
          className="lift focus-glow mt-8 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-subtle p-4"
        >
          <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm text-warning">
            {generation.failed > 0
              ? `${generation.failed} generation ${generation.failed === 1 ? "run has" : "runs have"} failed`
              : null}
            {generation.failed > 0 && faults > 0 ? " and " : null}
            {faults > 0
              ? `${faults} ${faults === 1 ? "fault has" : "faults have"} been recorded`
              : null}{" "}
            in the last {windowDays} days.
          </span>
          <ArrowRight className="size-4 shrink-0 text-warning" aria-hidden="true" />
        </Link>
      ) : null}

      <section className="mt-8">
        <h2 className="label-caps">People</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Accounts"
            value={people.total}
            detail={`${people.newThisWindow} joined in ${windowDays} days`}
            href="/admin/users"
          />
          <Stat
            label="On a paid plan"
            value={people.paid}
            detail={people.total > 0 ? `of ${people.total} accounts` : "no accounts yet"}
          />
          <Stat
            label="Admins"
            value={people.admins}
            detail="active, able to sign in"
            href="/admin/users"
          />
          <Stat
            label="Suspended"
            value={people.suspended}
            detail={people.suspended === 1 ? "account" : "accounts"}
            tone="warning"
            href="/admin/users"
          />
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="label-caps">Projects</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Active"
            value={projects.total}
            detail={`${projects.newThisWindow} created in ${windowDays} days`}
            href="/admin/projects"
          />
          <Stat
            label="Real projects"
            value={projects.real}
            detail={`${projects.demo} sample${projects.demo === 1 ? "" : "s"} alongside`}
            href="/admin/projects?kind=REAL"
          />
          <Stat label="Ready" value={projects.ready} detail="generated at least once" />
          <Stat
            label="Deleted"
            value={projects.deleted}
            detail="recoverable, not erased"
            href="/admin/projects?deleted=1"
          />
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="label-caps">Generation</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/*
           * Runs, successes and failures as three separate counts rather than a
           * success rate. At these volumes a percentage swings wildly on one
           * job and reads as precision the number does not have.
           */}
          <Stat label="Runs" value={generation.runs} detail={`in ${windowDays} days`} />
          <Stat label="Succeeded" value={generation.succeeded} detail={`in ${windowDays} days`} />
          <Stat
            label="Failed"
            value={generation.failed}
            detail={`in ${windowDays} days`}
            tone="warning"
            href="/admin/health"
          />
          <Stat
            label="In flight"
            value={generation.inFlight}
            detail="queued or running now"
            href="/admin/health"
          />
        </dl>
      </section>

      <section className="mt-8 pb-4">
        <h2 className="label-caps">Work done</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Tokens"
            value={work.tokens}
            detail={`generation and editing, ${windowDays} days`}
          />
          <Stat label="Exports" value={work.exports} detail={`in ${windowDays} days`} />
          <div className="rounded-xl border border-border bg-card p-4 elevated-1">
            <dt className="text-[0.8125rem] text-muted-foreground">Uploads stored</dt>
            <dd className="mt-3">
              <span className="mono-figure text-[2rem] leading-none font-medium">
                {formatBytes(work.storageBytes)}
              </span>
              <span className="mt-2 block text-xs text-subtle-foreground">
                across every project
              </span>
            </dd>
          </div>
          <Stat
            label="Awaiting student data"
            value={work.unresolvedPlaceholders}
            detail="marked places, never invented"
          />
        </dl>
      </section>
    </div>
  );
}
