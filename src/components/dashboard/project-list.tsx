"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookOpen, FilePlus2, FolderOpen, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createDemoProject } from "@/server/actions/demo";
import { createProject, deleteProject, duplicateProject } from "@/server/actions/projects";

export interface ProjectCardData {
  id: string;
  title: string;
  topic: string | null;
  kind: "REAL" | "DEMO";
  status: string;
  completionPct: number;
  lastGeneratedSection: string | null;
  updatedAt: string;
  department: string | null;
}

function StatusPill({ status, kind }: { status: string; kind: "REAL" | "DEMO" }) {
  if (kind === "DEMO") {
    return (
      <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
        Sample project
      </span>
    );
  }
  const label =
    status === "DRAFT"
      ? "Setup in progress"
      : status === "GENERATING"
        ? "Generating"
        : status === "READY"
          ? "Ready"
          : "Archived";
  return (
    <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function NewProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createProject({ title });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          router.push(`/projects/${result.data.id}/wizard/1`);
        });
      }}
    >
      <div className="flex-1">
        <label htmlFor="new-project-title" className="sr-only">
          Working title for your new project
        </label>
        <input
          id="new-project-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Effect of study habits on academic performance"
          className="h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>
      <Button type="submit" disabled={pending || title.trim().length === 0}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <FilePlus2 className="size-4" aria-hidden="true" />
        )}
        Create New Project
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:sr-only">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function DemoLauncher({ hasDemo }: { hasDemo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="font-medium">
            {hasDemo ? "You have a sample project" : "Not sure what you'll get?"}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Open a complete five-chapter sample to see how a finished project is organised. Its
            findings are illustrative — it describes no real study.
          </p>
          {error ? (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createDemoProject();
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.push(`/projects/${result.data.id}/blueprint`);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {hasDemo ? "Open sample project" : "Explore a sample project"}
      </Button>
    </div>
  );
}

export function ProjectList({
  projects,
  query,
}: {
  projects: ProjectCardData[];
  query: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [search, setSearch] = useState(query);

  return (
    <div className="space-y-8">
      <NewProjectForm />

      <DemoLauncher hasDemo={projects.some((p) => p.kind === "DEMO")} />

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          router.push(search.trim() ? `/dashboard?q=${encodeURIComponent(search.trim())}` : "/dashboard");
        }}
      >
        <label htmlFor="project-search" className="sr-only">
          Search your projects
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="project-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, topic or department"
            className="h-11 w-full rounded-md border border-input bg-card pr-3 pl-9 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      </form>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <FolderOpen className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">
            {query ? "No projects matched that search" : "No projects yet"}
          </h2>
          <p className="mx-auto mt-2 max-w-md leading-relaxed text-muted-foreground">
            {query
              ? "Try a different title, topic or department."
              : "Give your project a working title above to begin. You can change it at any time."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex flex-col rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  <Link
                    href={`/projects/${project.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {project.title}
                  </Link>
                </h2>
                <StatusPill status={project.status} kind={project.kind} />
              </div>

              {project.topic ? (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {project.topic}
                </p>
              ) : null}

              <dl className="mt-4 space-y-1 text-sm text-muted-foreground">
                {project.department ? (
                  <div className="flex gap-2">
                    <dt className="font-medium">Department:</dt>
                    <dd>{project.department}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="font-medium">Last edited:</dt>
                  <dd>{project.updatedAt}</dd>
                </div>
                {project.lastGeneratedSection ? (
                  <div className="flex gap-2">
                    <dt className="font-medium">Last generated:</dt>
                    <dd>{project.lastGeneratedSection}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Setup</span>
                  <span className="text-muted-foreground">{project.completionPct}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={project.completionPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${project.title} setup progress`}
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${project.completionPct}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/projects/${project.id}`}>
                    {project.status === "DRAFT" ? "Continue" : "Open"}
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === project.id}
                  onClick={async () => {
                    setPendingId(project.id);
                    const result = await duplicateProject({ projectId: project.id });
                    setPendingId(null);
                    if (result.ok) router.refresh();
                  }}
                >
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendingId === project.id}
                  onClick={async () => {
                    if (!confirm(`Delete "${project.title}"? You can ask us to restore it later.`)) {
                      return;
                    }
                    setPendingId(project.id);
                    const result = await deleteProject({ projectId: project.id });
                    setPendingId(null);
                    if (result.ok) router.refresh();
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
