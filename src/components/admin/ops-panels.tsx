"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, Loader2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { requeueGenerationJob, revealErrorDetail } from "@/server/actions/admin";
import type { AilingJob, JobAilment, WorkerStatus } from "@/server/services/ops/health";

const AILMENT_LABEL: Record<JobAilment, string> = {
  failed: "Failed",
  exhausted: "Out of attempts",
  abandoned: "Worker died",
  orphaned: "No worker for provider",
  unattended: "No workers running",
};

/**
 * Jobs that have stopped making progress.
 *
 * Empty is the healthy state and says so, rather than showing an empty table —
 * an operator should be able to recognise "nothing is wrong" without reading
 * anything.
 */
export function JobHealth({
  jobs,
  remedies,
}: {
  jobs: AilingJob[];
  remedies: Record<JobAilment, string>;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 elevated-1">
        <p className="flex items-center gap-2.5 text-sm">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          Every generation job is either running or finished.
        </p>
      </div>
    );
  }

  function requeue(jobId: string) {
    setPendingId(jobId);
    setError(null);
    startTransition(async () => {
      const result = await requeueGenerationJob({ jobId });
      setPendingId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="rounded-xl border border-border bg-card p-4 elevated-1 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-semibold tracking-[-0.014em]">
                  {job.projectTitle}
                </p>
                <p className="label-caps mt-1.5">
                  {job.provider || "no provider"} · attempt {job.attempts}/{job.maxAttempts}
                </p>
              </div>

              <span className="mono flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                <StatusDot status={job.ailment === "failed" ? "FAILED" : "PENDING"} />
                {AILMENT_LABEL[job.ailment]}
              </span>
            </div>

            {/* What to do about it, not only what is wrong. */}
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {remedies[job.ailment]}
            </p>

            {job.error ? (
              <p className="mono mt-2 line-clamp-2 rounded-md bg-surface-sunken p-2 text-xs text-subtle-foreground">
                {job.error}
              </p>
            ) : null}

            {job.requeueable ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                disabled={pendingId === job.id}
                onClick={() => requeue(job.id)}
              >
                {pendingId === job.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw className="size-4" aria-hidden="true" />
                )}
                Requeue
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Which workers are alive.
 *
 * This is what turns "nothing is happening" into a diagnosis. A queued job with
 * no worker for its provider is invisible in the job row itself — nothing
 * failed, so there is no error to find.
 */
export function Workers({ workers }: { workers: WorkerStatus[] }) {
  if (workers.length === 0) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning-subtle p-4">
        <p className="text-sm text-warning">
          No worker has ever checked in. Generation cannot run until one is started.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {workers.map((worker) => (
        <li key={worker.id} className="rounded-xl border border-border bg-card p-4 elevated-1">
          <div className="flex items-center justify-between gap-3">
            <span className="mono text-sm font-medium">{worker.provider}</span>
            <span className="mono flex items-center gap-1.5 text-[0.625rem] tracking-[0.06em] uppercase">
              <StatusDot status={worker.online ? "RUNNING" : "FAILED"} />
              {worker.online ? "online" : "not responding"}
            </span>
          </div>
          <p className="mono mt-2 truncate text-[0.625rem] text-subtle-foreground">{worker.id}</p>
          <p className="mt-1 text-xs text-subtle-foreground">
            Last seen {new Date(worker.lastSeen).toLocaleString("en-GB")}
          </p>
        </li>
      ))}
    </ul>
  );
}

export interface ErrorRow {
  id: string;
  code: string;
  summary: string;
  origin: string | null;
  createdAt: string;
  hasDetail: boolean;
}

/**
 * Recent faults.
 *
 * Only the sanitised summary is shown. Error messages can quote the student's
 * draft or their uploaded documents, so the full text is behind a deliberate
 * reveal that writes an audit row — the same terms as opening their project.
 */
export function RecentErrors({ errors }: { errors: ErrorRow[] }) {
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (errors.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 elevated-1">
        <p className="flex items-center gap-2.5 text-sm">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          No faults recorded.
        </p>
      </div>
    );
  }

  function reveal(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await revealErrorDetail({ errorId: id });
      setPendingId(null);
      setRevealed((current) => ({
        ...current,
        [id]: result.ok ? (result.data.detail || "(no further detail)") : result.message,
      }));
    });
  }

  return (
    <ul className="space-y-2">
      {errors.map((row) => (
        <li key={row.id} className="rounded-xl border border-border bg-card p-4 elevated-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mono text-xs text-destructive">{row.code}</p>
              <p className="mt-1.5 text-sm leading-relaxed">{row.summary}</p>
              <p className="label-caps mt-2">
                {row.origin ?? "unknown origin"} ·{" "}
                {new Date(row.createdAt).toLocaleString("en-GB")}
              </p>
            </div>

            {row.hasDetail && revealed[row.id] === undefined ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pendingId === row.id}
                onClick={() => reveal(row.id)}
                title="Shows the full message, which may contain the student's own text. This is recorded."
              >
                {pendingId === row.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
                Reveal
              </Button>
            ) : null}
          </div>

          {revealed[row.id] !== undefined ? (
            <pre className="mono mt-3 max-h-64 overflow-auto rounded-md bg-surface-sunken p-3 text-xs whitespace-pre-wrap text-muted-foreground">
              {revealed[row.id]}
            </pre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
