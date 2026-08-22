"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BookOpen,
  FilePlus2,
  FolderOpen,
  Loader2,
  Search,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusDot } from "@/components/ui/status-dot";
import { createDemoProject } from "@/server/actions/demo";
import {
  createProject,
  createProjectFromTopic,
  deleteProject,
  duplicateProject,
} from "@/server/actions/projects";

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

/**
 * The card's state line.
 *
 * A sample project is marked in amber, which is the one job amber still has
 * now that blue is the identity accent — it needs to be the colour that is
 * never used for anything the product is proud of.
 *
 * The dot pulses only while `status` is GENERATING, which is a real column, so
 * an animating card always means the worker is actually running.
 */
function StatusPill({
  status,
  kind,
}: {
  status: string;
  kind: "REAL" | "DEMO";
}) {
  if (kind === "DEMO") {
    return (
      <span className="mono shrink-0 rounded-full border border-warning/40 bg-warning-subtle px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-warning uppercase">
        Sample
      </span>
    );
  }

  const label =
    status === "DRAFT"
      ? "Setup"
      : status === "GENERATING"
        ? "Generating"
        : status === "READY"
          ? "Ready"
          : "Archived";

  return (
    <span className="mono flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
      <StatusDot status={status} />
      {label}
    </span>
  );
}

/**
 * Project types offered on the fast path.
 *
 * A short list rather than every seeded type: this control exists to keep the
 * structure right without turning the fast path back into a form. The full set
 * is still available in the wizard's own project-type step.
 *
 * The keys must match `ProjectTypeDef.key` — the server rejects anything it
 * has not seeded, because the structure template and the methodology form both
 * key off this value.
 */
const QUICK_TYPES = [
  { value: "research-project", label: "Research project" },
  { value: "project-proposal", label: "Proposal" },
  { value: "thesis", label: "Thesis" },
  { value: "dissertation", label: "Dissertation" },
  { value: "seminar", label: "Seminar" },
  { value: "research-paper", label: "Research paper" },
] as const;

/**
 * Starting a project.
 *
 * Closed, this is a single button. The dashboard's job is to show the work that
 * already exists, and a permanently-open form with an empty field, a dropdown
 * and two buttons made starting a project look like the main event on a page
 * about everything else.
 *
 * Opened, it asks the two things that actually shape the document — the topic
 * and the type — and then offers the real choice: set the project up properly,
 * or skip straight to a structured draft.
 *
 * The fast path is not a lesser product; the wizard has always been optional.
 * It does produce a thinner project though, and the note says so rather than
 * letting the student discover it in the output.
 */
function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [projectType, setProjectType] = useState<string>(QUICK_TYPES[0].value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The fast path builds a whole document from this one sentence, so it asks
  // for a little more than a working title does.
  const tooShortToSkip = topic.trim().length < 12;

  function run(mode: "setup" | "skip") {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "skip"
          ? await createProjectFromTopic({ topic, projectType })
          : await createProject({ title: topic });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      // Skipping setup lands on the blueprint: the structure was chosen for
      // them, so they should see it before spending a generation run.
      router.push(
        mode === "skip"
          ? `/projects/${result.data.id}/blueprint`
          : `/projects/${result.data.id}/wizard/1`,
      );
    });
  }

  if (!open) {
    return (
      // No `aria-controls` while collapsed: the form it would name is not in
      // the DOM yet, and a reference to a missing id is worse than none.
      <Button type="button" onClick={() => setOpen(true)} aria-expanded={false}>
        <FilePlus2 className="size-4" aria-hidden="true" />
        Create New Project
      </Button>
    );
  }

  return (
    <form
      id="new-project-form"
      className="rise-in space-y-4 rounded-xl border border-border bg-card p-5 elevated-1"
      onSubmit={(event) => {
        event.preventDefault();
        run("setup");
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-[-0.014em]">
            Start a new project
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What are you writing about? You can change any of this later.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="focus-glow flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label
            htmlFor="new-project-title"
            className="mb-1.5 block text-sm font-medium"
          >
            Project topic
          </label>
          <input
            id="new-project-title"
            autoFocus
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="h-11 w-full field px-3 text-base"
          />
        </div>

        <div className="sm:w-52">
          <label
            htmlFor="new-project-type"
            className="mb-1.5 block text-sm font-medium"
          >
            Type
          </label>
          <select
            id="new-project-type"
            value={projectType}
            onChange={(event) => setProjectType(event.target.value)}
            className="h-11 w-full cursor-pointer field px-3 text-base"
          >
            {QUICK_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || topic.trim().length === 0}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Set up my project
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || tooShortToSkip}
          onClick={() => run("skip")}
          title={
            tooShortToSkip
              ? "Describe your topic in a few words first"
              : "Creates the project with a standard structure, ready to generate"
          }
        >
          <Zap className="size-4" aria-hidden="true" />
          Skip setup
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-subtle-foreground">
        <span className="font-medium text-muted-foreground">Skip setup</span>{" "}
        builds the project from your topic with a standard chapter structure,
        ready to generate. Anything it cannot know — your methodology, sample,
        institution — is marked for you rather than invented, so expect more to
        fill in afterwards.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 elevated-1">
      <div className="flex items-start gap-3">
        <BookOpen
          className="mt-0.5 size-5 shrink-0 text-warning"
          aria-hidden="true"
        />
        <div>
          <p className="font-medium">
            {hasDemo
              ? "You have a sample project"
              : "Not sure what you'll get?"}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Open a complete five-chapter sample to see how a finished project is
            organised. Its findings are illustrative — it describes no real
            study.
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
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
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
          router.push(
            search.trim()
              ? `/dashboard?q=${encodeURIComponent(search.trim())}`
              : "/dashboard",
          );
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
            className="h-11 w-full field pr-3 pl-9 text-base"
          />
        </div>
      </form>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-card/40 p-12 text-center">
          <FolderOpen
            className="mx-auto size-7 text-muted-foreground"
            aria-hidden="true"
          />
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
              className="lift group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card elevated-1 hover:border-border-strong"
            >
              {/*
               * The card head sits on the sunken surface so the card reads as
               * a small workspace with its own title bar, rather than as a
               * rectangle with text in it.
               */}
              {/*
               * A fixed head height, with the title clamped to two lines and
               * the department row always present. Without both, the divider
               * lands at a different height on every card and the grid stops
               * reading as a set of equivalent things.
               */}
              <div className="flex h-[5.75rem] flex-col justify-between border-b border-border bg-surface-sunken/60 px-5 pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold tracking-[-0.014em]">
                    <Link
                      href={`/projects/${project.id}`}
                      className="focus-glow rounded-sm outline-none transition-colors duration-150 group-hover:text-primary"
                    >
                      {/* Stretches the link over the whole card, so the card
                          is one target rather than a small piece of text. */}
                      <span className="absolute inset-0" aria-hidden="true" />
                      {project.title}
                    </Link>
                  </h2>
                  <StatusPill status={project.status} kind={project.kind} />
                </div>

                <p className="label-caps truncate">
                  {project.department ?? "No department set"}
                </p>
              </div>

              <div className="flex flex-1 flex-col p-5">
                {project.topic ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {project.topic}
                  </p>
                ) : null}

                <dl className="mt-4 space-y-1.5 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-subtle-foreground">Last edited</dt>
                    {/* Sans, not mono: tabular figures pad a date containing a
                        month name into an uneven rhythm. Mono is for numbers
                        that get compared down a column. */}
                    <dd className="text-muted-foreground">
                      {project.updatedAt}
                    </dd>
                  </div>
                  {project.lastGeneratedSection ? (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-subtle-foreground">
                        Last built
                      </dt>
                      <dd className="truncate text-right text-muted-foreground">
                        {project.lastGeneratedSection}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-subtle-foreground">Setup</span>
                    <span className="mono-figure text-muted-foreground">
                      {project.completionPct}%
                    </span>
                  </div>
                  <Progress
                    className="mt-1.5"
                    value={project.completionPct}
                    label={`${project.title} setup progress`}
                    tone={project.completionPct >= 100 ? "success" : "primary"}
                  />
                </div>

                {/* `relative` lifts the controls above the stretched title
                    link, which would otherwise swallow their clicks. */}
                <div className="relative mt-5 flex flex-wrap gap-2 pt-1">
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
                      const result = await duplicateProject({
                        projectId: project.id,
                      });
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
                      if (
                        !confirm(
                          `Delete "${project.title}"? You can ask us to restore it later.`,
                        )
                      ) {
                        return;
                      }
                      setPendingId(project.id);
                      const result = await deleteProject({
                        projectId: project.id,
                      });
                      setPendingId(null);
                      if (result.ok) router.refresh();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
