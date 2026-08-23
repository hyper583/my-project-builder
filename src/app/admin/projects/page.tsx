import Link from "next/link";
import { Search } from "lucide-react";

import { StatusDot } from "@/components/ui/status-dot";
import { requireAdmin } from "@/server/dal/session";
import { listAllProjects } from "@/server/services/ops/projects";

export const dynamic = "force-dynamic";

const KINDS = ["", "REAL", "DEMO"] as const;
const STATUSES = ["", "DRAFT", "GENERATING", "READY", "ARCHIVED"] as const;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value);
}

/**
 * Every project, as metadata.
 *
 * Nothing on this page is recorded, because nothing on it is a student's
 * writing. Opening a project's prose is a separate action on its own page, and
 * that one records itself.
 */
export default async function AdminProjectsPage({ searchParams }: PageProps<"/admin/projects">) {
  await requireAdmin();
  const params = await searchParams;

  const search = typeof params.q === "string" ? params.q : "";
  const kind = typeof params.kind === "string" && params.kind ? params.kind : undefined;
  const status = typeof params.status === "string" && params.status ? params.status : undefined;
  const includeDeleted = params.deleted === "1";

  const projects = await listAllProjects({
    search,
    kind: kind === "REAL" || kind === "DEMO" ? kind : undefined,
    status,
    includeDeleted,
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="label-caps">Projects</p>
        <h1 className="mt-2 text-[2rem] leading-none font-semibold tracking-[-0.035em]">
          All projects
        </h1>
        <p className="mt-2.5 max-w-2xl leading-relaxed text-muted-foreground">
          Titles, owners and counts. Opening a project&apos;s actual writing is a separate
          step and is recorded against your account.
        </p>
      </header>

      <form role="search" method="GET" className="mt-8 space-y-3">
        <div className="relative">
          <label htmlFor="project-search" className="sr-only">
            Search projects by title, topic or owner
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="project-search"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Search by title, topic or owner email"
            className="h-11 w-full field pr-3 pl-9 text-base"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="filter-kind" className="sr-only">
              Kind
            </label>
            <select
              id="filter-kind"
              name="kind"
              defaultValue={kind ?? ""}
              className="h-10 cursor-pointer field px-3 text-sm"
            >
              {KINDS.map((value) => (
                <option key={value || "any"} value={value}>
                  {value === "" ? "Any kind" : value === "REAL" ? "Real" : "Sample"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-status" className="sr-only">
              Status
            </label>
            <select
              id="filter-status"
              name="status"
              defaultValue={status ?? ""}
              className="h-10 cursor-pointer field px-3 text-sm"
            >
              {STATUSES.map((value) => (
                <option key={value || "any"} value={value}>
                  {value === "" ? "Any status" : value.charAt(0) + value.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <label
            htmlFor="include-deleted"
            className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
          >
            {/* Named explicitly rather than by wrapping — see the note on the
                wizard's radio fields. */}
            <input
              id="include-deleted"
              type="checkbox"
              name="deleted"
              value="1"
              defaultChecked={includeDeleted}
              className="size-4 cursor-pointer accent-primary"
            />
            Include deleted
          </label>

          <button
            type="submit"
            className="focus-glow h-10 cursor-pointer rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors duration-150 hover:border-border-strong hover:bg-muted"
          >
            Apply
          </button>
        </div>
      </form>

      {projects.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground elevated-1">
          No projects match those filters.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/admin/projects/${project.id}`}
                className="lift focus-glow block rounded-xl border border-border bg-card p-4 elevated-1 hover:border-border-strong sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.9375rem] font-semibold tracking-[-0.014em]">
                      {project.title}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {project.ownerEmail}
                    </p>
                    <p className="label-caps mt-2 truncate">
                      {project.department ?? "no department"} · {project.sections} sections ·
                      updated {formatDate(project.updatedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="flex items-center gap-2">
                      {project.deleted ? (
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
                    </span>

                    <span className="mono text-[0.625rem] text-subtle-foreground">
                      {project.completionPct}% set up
                      {project.placeholders > 0
                        ? ` · ${project.placeholders} awaiting data`
                        : ""}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
