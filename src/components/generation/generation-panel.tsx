"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CircleDashed, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cancelGeneration, startGeneration } from "@/server/actions/generation";

/**
 * Live generation progress.
 *
 * Every tick shown here comes from generation_step rows the worker wrote. The
 * component has no timer-driven animation and no optimistic stage advancement —
 * if a stage shows as running, a worker is genuinely on it.
 */

type StepStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

interface Step {
  key: string;
  label: string;
  status: StepStatus;
  error: string | null;
}

interface Progress {
  jobId: string;
  status: StepStatus;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  steps: Step[];
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "SUCCEEDED") {
    return <Check className="size-4 shrink-0 text-success" aria-hidden="true" />;
  }
  if (status === "RUNNING") {
    return <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />;
  }
  if (status === "FAILED") {
    return <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />;
  }
  return <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export function GenerationPanel({
  projectId,
  aiConfigured,
  initiallyRunning,
}: {
  projectId: string;
  aiConfigured: boolean;
  initiallyRunning: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [watching, setWatching] = useState(initiallyRunning);
  const sourceRef = useRef<EventSource | null>(null);

  const stopWatching = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(() => {
    if (!watching) return;

    const source = new EventSource(`/api/projects/${projectId}/generation/stream`);
    sourceRef.current = source;

    source.addEventListener("progress", (event) => {
      setProgress(JSON.parse((event as MessageEvent).data) as Progress);
    });

    source.addEventListener("done", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        status: string;
        error: string | null;
      };
      stopWatching();
      setWatching(false);
      if (data.status === "SUCCEEDED") {
        // Pull the newly written sections into the page.
        router.refresh();
      } else if (data.error) {
        setError(data.error);
      }
    });

    source.addEventListener("idle", () => {
      stopWatching();
      setWatching(false);
    });

    source.onerror = () => {
      // The browser reconnects on its own; a stream that has genuinely ended
      // has already sent "done", so there is nothing to report here.
      stopWatching();
      setWatching(false);
    };

    return stopWatching;
  }, [watching, projectId, router, stopWatching]);

  const steps = progress?.steps ?? [];
  const doneCount = steps.filter((s) => s.status === "SUCCEEDED").length;
  const isRunning = watching || progress?.status === "RUNNING" || progress?.status === "QUEUED";

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Generate project</h2>
          <p className="mt-1 max-w-xl leading-relaxed text-muted-foreground">
            Generation runs on the server. You can close this page and come back —
            it will keep going, and finished chapters are saved as they complete.
          </p>
        </div>

        {isRunning ? (
          <Button
            variant="outline"
            onClick={async () => {
              const result = await cancelGeneration({ projectId });
              stopWatching();
              setWatching(false);
              if (!result.ok) setError(result.message);
              else router.refresh();
            }}
          >
            Stop
          </Button>
        ) : (
          <Button
            disabled={!aiConfigured || starting}
            title={aiConfigured ? undefined : "AI is not configured on this installation"}
            onClick={async () => {
              setStarting(true);
              setError(null);
              const result = await startGeneration({ projectId });
              setStarting(false);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setWatching(true);
            }}
          >
            {starting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            Generate Project
          </Button>
        )}
      </div>

      {!aiConfigured ? (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong className="font-medium">AI is not configured on this installation.</strong>{" "}
            Generation stays disabled until an API key is set, rather than producing
            placeholder text that looks like a real project.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {steps.length > 0 ? (
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {progress?.status === "SUCCEEDED"
                ? "Generation complete"
                : progress?.status === "FAILED"
                  ? "Generation stopped"
                  : "Generating your project"}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {doneCount} of {steps.length}
            </span>
          </div>

          <ol className="mt-3 space-y-2" aria-live="polite">
            {steps.map((step) => (
              <li key={step.key} className="flex items-start gap-2.5 text-sm">
                <StepIcon status={step.status} />
                <span
                  className={
                    step.status === "SUCCEEDED"
                      ? "text-muted-foreground"
                      : step.status === "RUNNING"
                        ? "font-medium"
                        : step.status === "FAILED"
                          ? "text-destructive"
                          : "text-muted-foreground"
                  }
                >
                  {step.label}
                  {step.error ? (
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      This stage didn&apos;t complete. Your finished chapters are safe.
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>

          {progress && progress.attempts > 1 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Retrying after an interruption (attempt {progress.attempts} of{" "}
              {progress.maxAttempts}). Completed stages are not repeated.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
