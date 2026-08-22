import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ProjectReader } from "@/components/admin/project-reader";
import { StatusDot } from "@/components/ui/status-dot";
import { requireAdmin } from "@/server/dal/session";
import { getProjectMetadata } from "@/server/services/ops/projects";

export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
    value,
  );
}

/**
 * One project, as metadata — plus the gate in front of its content.
 *
 * This page never loads a section's prose. `getProjectMetadata` cannot return
 * it, so a mistake here cannot put a student's writing on screen without the
 * audit row that is meant to accompany it. The reader below fetches content
 * through an action that records itself first.
 */
export default async function AdminProjectPage({ params }: PageProps<"/admin/projects/[id]">) {
  await requireAdmin();
  const { id } = await params;

  const project = await getProjectMetadata(id);
  if (!project) notFound();

  const facts: Array<[string, string]> = [
    ["Owner", `${project.user.name} · ${project.user.email}`],
    ["Kind", project.kind === "DEMO" ? "Sample project" : "Real project"],
    ["Type", project.projectType ?? "Not set"],
    ["Institution", project.institution?.institution ?? "Not provided"],
    ["Department", project.institution?.department ?? "Not provided"],
    ["Programme", project.institution?.programme ?? "Not provided"],
    ["Topic", project.topic ?? "Not provided"],
    ["Setup", `${project.completionPct}%`],
    ["Sections", String(project._count.sections)],
    ["Documents", String(project._count.documents)],
    ["References", String(project._count.references)],
    ["Created", formatDate(project.createdAt)],
    ["Last updated", formatDate(project.updatedAt)],
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <Link
        href="/admin/projects"
        className="focus-glow inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All projects
      </Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          {project.deletedAt ? (
            <span className="mono rounded-full border border-destructive/40 bg-destructive-subtle px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-destructive uppercase">
              Deleted
            </span>
          ) : null}
          {project.kind === "DEMO" ? (
            <span className="mono rounded-full border border-warning/40 bg-warning-subtle px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-warning uppercase">
              Sample
            </span>
          ) : null}
          <span className="mono flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
            <StatusDot status={project.status} />
            {project.status.toLowerCase()}
          </span>
        </div>

        <h1 className="mt-3 text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">
          {project.title}
        </h1>
      </header>

      <section className="mt-8">
        <h2 className="label-caps">Details</h2>
        <dl className="mt-3 overflow-hidden rounded-xl border border-border bg-card elevated-1">
          {facts.map(([label, value], index) => (
            <div
              key={label}
              className={`flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 ${
                index > 0 ? "border-t border-border" : ""
              }`}
            >
              <dt className="w-32 shrink-0 text-sm text-subtle-foreground">{label}</dt>
              <dd className="min-w-0 flex-1 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 pb-4">
        <h2 className="label-caps">Content</h2>
        <div className="mt-3">
          <ProjectReader
            projectId={project.id}
            ownerEmail={project.user.email}
            sectionCount={project._count.sections}
          />
        </div>
      </section>
    </div>
  );
}
