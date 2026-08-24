import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, FolderOpen, Sparkles, TriangleAlert } from "lucide-react";

import { CountUp } from "@/components/motion/count-up";
import { ProjectList, type ProjectCardData } from "@/components/dashboard/project-list";
import { entitlementsFor, FREE_PROJECT_ALLOWANCE } from "@/config/plans";
import { listProjects } from "@/server/dal/projects";
import { requireSession } from "@/server/dal/session";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "My Projects" };

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value);
}

/** Start of the rolling 30-day window the usage limits are counted over. */
function windowStart(): Date {
  return new Date(Date.now() - 30 * 24 * 3600_000);
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireSession();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const plan = entitlementsFor(user.planTier);

  const mine = { userId: user.id, deletedAt: null };
  const since = windowStart();

  // Counts are unfiltered by the search box on purpose — a summary that
  // changed as you typed a query would be measuring the search, not the work.
  const [projects, activeCount, readyCount, placeholderCount, generationCount] =
    await Promise.all([
      listProjects(query),
      prisma.project.count({ where: { ...mine, status: { not: "ARCHIVED" } } }),
      prisma.project.count({ where: { ...mine, status: "READY" } }),
      prisma.sectionPlaceholder.count({
        where: { resolved: false, section: { project: mine } },
      }),
      prisma.generationJob.count({
        where: { project: mine, createdAt: { gte: since } },
      }),
    ]);

  const cards: ProjectCardData[] = projects.map((project) => ({
    id: project.id,
    title: project.title,
    topic: project.topic,
    kind: project.kind,
    status: project.status,
    completionPct: project.completionPct,
    lastGeneratedSection: project.lastGeneratedSection,
    updatedAt: formatDate(project.updatedAt),
    department: project.institution?.department ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Workspace</p>
          <h1 className="mt-2 text-[2rem] leading-none font-semibold tracking-[-0.035em]">
            My Projects
          </h1>
          <p className="mt-2.5 leading-relaxed text-muted-foreground">
            Welcome back, {user.name.split(" ")[0]}. Your work saves as you go.
          </p>
        </div>
        <Link
          href="/settings"
          className="mono focus-glow rounded-full border border-border px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.08em] text-muted-foreground uppercase transition-colors duration-150 hover:border-border-strong hover:text-foreground"
        >
          {plan.label} plan
        </Link>
      </header>

      <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={FolderOpen}
          label="Active projects"
          value={activeCount}
          detail={`of ${plan.maxProjects} on your plan`}
        />
        <Stat
          icon={CircleCheck}
          label="Ready"
          value={readyCount}
          detail={readyCount === 1 ? "project generated" : "projects generated"}
        />
        <Stat
          icon={TriangleAlert}
          label="Needs your data"
          value={placeholderCount}
          detail={placeholderCount === 1 ? "marked place" : "marked places"}
          tone={placeholderCount > 0 ? "warning" : "default"}
        />
        <Stat
          icon={Sparkles}
          label="Generation runs"
          value={generationCount}
          detail={`of ${FREE_PROJECT_ALLOWANCE.maxGenerations} free in 30 days`}
        />
      </dl>

      <div className="mt-8">
        <ProjectList projects={cards} query={query} />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof FolderOpen;
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="lift lift-scale rounded-xl border border-border bg-card p-4 elevated-1 hover:border-border-strong">
      <dt className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
        <Icon
          className={`size-3.5 ${tone === "warning" ? "text-warning" : "text-subtle-foreground"}`}
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd className="mt-3">
        <span
          className={`mono-figure text-[2rem] leading-none font-medium ${
            tone === "warning" ? "text-warning" : ""
          }`}
        >
          <CountUp value={value} />
        </span>
        <span className="mt-2 block text-xs text-subtle-foreground">{detail}</span>
      </dd>
    </div>
  );
}
