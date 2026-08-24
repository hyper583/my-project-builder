import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";

import { AppearanceSetting } from "@/components/settings/appearance-setting";
import { entitlementsFor, FREE_PROJECT_ALLOWANCE, PASS_ALLOWANCE } from "@/config/plans";
import { requireSession } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { unclaimedPassCount } from "@/server/services/entitlements";

export const metadata: Metadata = { title: "Settings" };

/** Start of the rolling 30-day window the usage limits are counted over. */
function windowStart(): Date {
  return new Date(Date.now() - 30 * 24 * 3600_000);
}

export default async function SettingsPage() {
  const user = await requireSession();
  const plan = entitlementsFor(user.planTier);
  const since = windowStart();

  // Real counts, read from the same tables the limits are enforced against —
  // so what this page shows and what the server allows cannot drift apart.
  const [projectCount, generationCount, editCount, passesAvailable, passesClaimed] = await Promise.all([
    prisma.project.count({ where: { userId: user.id, deletedAt: null, status: { not: "ARCHIVED" } } }),
    prisma.generationJob.count({
      where: { project: { userId: user.id }, createdAt: { gte: since } },
    }),
    prisma.usageRecord.count({
      where: { userId: user.id, kind: "AI_EDIT", createdAt: { gte: since } },
    }),
    unclaimedPassCount(user.id),
    prisma.projectPass.count({ where: { userId: user.id, claimedAt: { not: null } } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-1.5 leading-relaxed text-muted-foreground">
          Your account, appearance and plan.
        </p>
      </header>

      <div className="space-y-5">
        <Section title="Account" description="How you appear across the product.">
          <dl className="divide-y divide-border">
            <Row label="Name" value={user.name || "Not set"} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={user.role === "ADMIN" ? "Administrator" : "Student"} />
          </dl>
        </Section>

        <Section
          title="Appearance"
          description="Choose a theme, or follow your device's setting."
        >
          <AppearanceSetting />
        </Section>

        <Section
          title="Project passes"
          description="A pass is spent on one project and does not expire. Its allowance belongs to that project."
        >
          <dl className="divide-y divide-border">
            <Row
              label="Passes available"
              value={passesAvailable === 0 ? "None" : String(passesAvailable)}
            />
            <Row label="Projects with a pass" value={String(passesClaimed)} />
          </dl>

          <p className="mt-5 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
            Each pass includes {PASS_ALLOWANCE.maxGenerations} generation runs and{" "}
            {PASS_ALLOWANCE.maxEdits} AI editing actions for its project, and lets you download
            the finished document.
          </p>
        </Section>

        <Section
          title={`Free allowance — ${plan.label}`}
          description="What you can do without a pass. Counted over a rolling 30-day window."
        >
          <div className="space-y-4">
            <Meter label="Active projects" used={projectCount} limit={plan.maxProjects} />
            <Meter
              label="Generation runs"
              used={generationCount}
              limit={FREE_PROJECT_ALLOWANCE.maxGenerations}
            />
            <Meter
              label="AI editing actions"
              used={editCount}
              limit={FREE_PROJECT_ALLOWANCE.maxEdits}
            />
          </div>

          <ul className="mt-6 space-y-2 border-t border-border pt-5">
            <Entitlement
              allowed={false}
              label="Download your own projects — included with a pass"
            />
            <Entitlement
              allowed={plan.canExportDemo}
              label="Export sample projects (always watermarked)"
            />
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card elevated-1">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = used >= limit;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm">{label}</span>
        <span className="tabular text-sm text-muted-foreground">
          {used} / {limit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            atLimit ? "bg-warning" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Entitlement({ allowed, label }: { allowed: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {allowed ? (
        <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <Minus className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
      )}
      <span className={allowed ? "" : "text-muted-foreground"}>{label}</span>
      <span className="sr-only">{allowed ? "included" : "not included"}</span>
    </li>
  );
}
