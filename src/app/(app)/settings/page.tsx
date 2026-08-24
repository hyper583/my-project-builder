import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";

import { AppearanceSetting } from "@/components/settings/appearance-setting";
import { EmailConfirmation } from "@/components/settings/email-confirmation";
import { BuyPassButton } from "@/components/payments/buy-pass-button";
import {
  entitlementsFor,
  FREE_LIFETIME_PROJECTS,
  FREE_PROJECT_ALLOWANCE,
  formatPassPrice,
  PASS_ALLOWANCE,
} from "@/config/plans";
import { requireSession } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { freeProjectsGenerated, unclaimedPassCount } from "@/server/services/entitlements";

export const metadata: Metadata = { title: "Settings" };

/** Start of the rolling 30-day window the usage limits are counted over. */
function windowStart(): Date {
  return new Date(Date.now() - 30 * 24 * 3600_000);
}

export default async function SettingsPage() {
  const user = await requireSession();
  // Read straight from the row: the session does not carry it, and this is the
  // one place that has to be right about it.
  const { emailVerified } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { emailVerified: true },
  });
  const plan = entitlementsFor(user.planTier);
  const since = windowStart();

  // Real counts, read from the same tables the limits are enforced against —
  // so what this page shows and what the server allows cannot drift apart.
  const [projectCount, freeGenerations, editCount, passesAvailable, passesClaimed] = await Promise.all([
    prisma.project.count({ where: { userId: user.id, deletedAt: null, status: { not: "ARCHIVED" } } }),
    // The same figure the server enforces against, not a second count that
    // could disagree with it.
    freeProjectsGenerated(user.id),
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

          <div className="mt-5 border-t border-border pt-5">
            <EmailConfirmation email={user.email} verified={emailVerified} />
          </div>
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

          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Each pass writes every chapter of its project, includes{" "}
              {PASS_ALLOWANCE.maxGenerations} generation runs and {PASS_ALLOWANCE.maxEdits} AI
              editing actions, and lets you download the finished document.
            </p>

            {/*
              Buying from here leaves the pass unclaimed — nothing has said
              which project it is for. Most students will buy from the project
              itself, where it is spent immediately; this is for anyone who
              wants one in hand first.
            */}
            <BuyPassButton
              variant="outline"
              label={`Buy a spare pass — ${formatPassPrice()}`}
              className="mt-4"
            />
          </div>
        </Section>

        <Section
          title={`Free allowance — ${plan.label}`}
          description="What you can do without a pass."
        >
          <div className="space-y-4">
            <Meter label="Active projects" used={projectCount} limit={plan.maxProjects} />
            {/*
              Two meters, counted two different ways, and the labels have to say
              so. Free projects are a lifetime total per account — the number
              does not come back — whereas editing actions renew. Showing both as
              though they shared a window was the previous version, and it told
              students the first one would return.
            */}
            <Meter
              label="Free projects written"
              used={freeGenerations}
              limit={FREE_LIFETIME_PROJECTS}
              note="across your account, in total"
            />
            <Meter
              label="AI editing actions"
              used={editCount}
              limit={FREE_PROJECT_ALLOWANCE.maxEdits}
              note="in the last 30 days"
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

function Meter({
  label,
  used,
  limit,
  note,
}: {
  label: string;
  used: number;
  limit: number;
  /** How this one is counted, when that is not the same as the others. */
  note?: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = used >= limit;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm">
          {label}
          {/*
            A real space, not only the margin. `ml-1.5` separates the two
            visually and leaves the accessible name as "Free projects
            writtenacross your account" — the gap has to exist in the text as
            well as in the layout.
          */}
          {note ? (
            <> <span className="ml-1.5 text-xs text-muted-foreground">{note}</span></>
          ) : null}
        </span>
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
