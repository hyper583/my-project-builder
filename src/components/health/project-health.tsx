"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  Check,
  CircleAlert,
  Info,
  Loader2,
  RefreshCw,
  Stethoscope,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { runAnalysis, updateIssueStatus } from "@/server/actions/consistency";

export interface HealthComponentRow {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface IssueRow {
  id: string;
  kind: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: string;
  summary: string;
  detail: string;
  source: string;
}

/**
 * Project Health and consistency findings.
 *
 * Findings are presented as questions for the student to answer, never as
 * corrections that have been applied. Nothing here edits their research: the
 * only actions are "I have dealt with this" and "this is not a problem".
 */
export function ProjectHealthPanel({
  projectId,
  score,
  band,
  components,
  issues,
  dismissedCount,
}: {
  projectId: string;
  score: number;
  band: "NEEDS_WORK" | "IN_PROGRESS" | "STRONG";
  components: HealthComponentRow[];
  issues: IssueRow[];
  dismissedCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function analyse() {
    setPending("analyse");
    setError(null);
    setNotice(null);

    const response = await runAnalysis({ projectId });
    setPending(null);

    if (!response.ok) {
      setError(response.message);
      return;
    }

    const { opened, resolved, stillOpen } = response.data;
    setNotice(
      opened === 0 && resolved === 0
        ? stillOpen === 0
          ? "Nothing to flag — no contradictions or gaps found."
          : `No change. ${stillOpen} ${stillOpen === 1 ? "finding" : "findings"} still open.`
        : [
            opened > 0 ? `${opened} new` : null,
            resolved > 0 ? `${resolved} resolved` : null,
          ]
            .filter(Boolean)
            .join(", ") + ".",
    );
    router.refresh();
  }

  async function setStatus(issueId: string, status: "OPEN" | "DISMISSED") {
    setPending(issueId);
    setError(null);

    const response = await updateIssueStatus({ projectId, issueId, status });
    setPending(null);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    router.refresh();
  }

  const bandLabel =
    band === "STRONG" ? "Strong" : band === "IN_PROGRESS" ? "In progress" : "Needs work";
  const bandTone =
    band === "STRONG" ? "text-success" : band === "IN_PROGRESS" ? "text-accent" : "text-warning";

  return (
    <section className="rounded-xl border border-border bg-card p-6 elevated-1">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl font-semibold">
            <Stethoscope className="size-5 text-primary" aria-hidden="true" />
            Project health
          </h2>
          <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">
            Contradictions and gaps found by checking your project against itself. Findings are
            shown for your decision — nothing in your research is changed.
          </p>
        </div>
        <Button variant="outline" onClick={analyse} disabled={pending !== null}>
          {pending === "analyse" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          Run check
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3 border-y border-border py-5">
        <div>
          <span className={`mono-figure text-[2.75rem] leading-none font-medium ${bandTone}`}>
            {score}
          </span>
          <span className="ml-1 text-lg text-muted-foreground">/100</span>
          <p className={`mt-1 text-sm font-medium ${bandTone}`}>{bandLabel}</p>
        </div>

        <dl className="grid flex-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {components.map((component) => (
            <div key={component.key}>
              <dt className="flex items-baseline justify-between gap-2 text-sm">
                <span>{component.label}</span>
                <span className="tabular text-muted-foreground">{component.score}</span>
              </dt>
              <dd>
                <div
                  role="progressbar"
                  aria-valuenow={component.score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={component.label}
                  className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${component.score}%` }}
                  />
                </div>
                <span className="mt-1 block text-xs leading-relaxed text-subtle-foreground">
                  {component.detail}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-md border border-border bg-muted p-3 text-sm"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      {issues.length === 0 ? (
        <p className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong p-6 text-center leading-relaxed text-muted-foreground">
          <Check className="size-4 text-success" aria-hidden="true" />
          No open findings.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {issues.map((issue) => {
            const Icon =
              issue.severity === "HIGH" ? TriangleAlert : issue.severity === "MEDIUM" ? CircleAlert : Info;
            const tone =
              issue.severity === "HIGH"
                ? "text-destructive"
                : issue.severity === "MEDIUM"
                  ? "text-warning"
                  : "text-muted-foreground";

            return (
              <li key={issue.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start gap-2.5">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{issue.summary}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {issue.detail}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending !== null}
                        onClick={() => setStatus(issue.id, "DISMISSED")}
                      >
                        {pending === issue.id ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : null}
                        Not a problem
                      </Button>
                      <span className="text-xs tracking-wide text-subtle-foreground uppercase">
                        {issue.severity === "HIGH"
                          ? "Serious"
                          : issue.severity === "MEDIUM"
                            ? "Worth checking"
                            : "Minor"}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dismissedCount > 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Undo2 className="size-3.5" aria-hidden="true" />
          {dismissedCount} {dismissedCount === 1 ? "finding" : "findings"} dismissed. They stay
          dismissed when you run the check again.
        </p>
      ) : null}
    </section>
  );
}
