"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, Loader2, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveGenerationSettings } from "@/server/actions/generation-settings";

/**
 * How long the document should be, and how recent its sources must be.
 *
 * Both are ranges rather than exact figures, because neither can be hit
 * exactly: a model cannot count pages, and a topic has however much recent
 * literature it has. Presenting them as targets rather than guarantees is the
 * honest framing, and the estimate below the page slider says what the range
 * means in words for this project's own layout.
 */
export function GenerationSettings({
  projectId,
  minPages,
  maxPages,
  sourceRecencyYears,
  wordsPerPage,
}: {
  projectId: string;
  minPages: number | null;
  maxPages: number | null;
  sourceRecencyYears: number | null;
  /** Derived from the project's own font size, spacing and margins. */
  wordsPerPage: number;
}) {
  const router = useRouter();
  const [min, setMin] = useState(minPages ?? 40);
  const [max, setMax] = useState(maxPages ?? 60);
  const [recency, setRecency] = useState(sourceRecencyYears ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Dragging one handle past the other is a way to ask for an impossible
  // range, so the pair is kept ordered as it moves.
  const setLow = (value: number) => {
    setMin(value);
    if (value > max) setMax(value);
    setSaved(false);
  };
  const setHigh = (value: number) => {
    setMax(value);
    if (value < min) setMin(value);
    setSaved(false);
  };

  async function save() {
    setPending(true);
    setError(null);

    const response = await saveGenerationSettings({
      projectId,
      minPages: min,
      maxPages: max,
      // Zero is the UI's way of saying "no limit"; the server stores null.
      sourceRecencyYears: recency === 0 ? null : recency,
    });
    setPending(false);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const thisYear = new Date().getFullYear();

  return (
    <section className="rounded-xl border border-border bg-card p-6 elevated-1">
      <h2 className="flex items-center gap-2.5 text-xl font-semibold">
        <SlidersHorizontal className="size-5 text-primary" aria-hidden="true" />
        Length and sources
      </h2>
      <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">
        What to aim for when generating. Both are targets rather than
        guarantees — you will be shown what was actually produced.
      </p>

      <div className="mt-6 space-y-7">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="min-pages" className="text-sm font-medium">
              Length
            </label>
            <span className="tabular text-sm text-muted-foreground">
              {min}–{max} pages · roughly {(min * wordsPerPage).toLocaleString()}–
              {(max * wordsPerPage).toLocaleString()} words
            </span>
          </div>

          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Minimum</span>
              <input
                id="min-pages"
                type="range"
                min={5}
                max={200}
                step={5}
                value={min}
                onChange={(event) => setLow(Number(event.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
              <span className="tabular w-12 shrink-0 text-right text-sm">{min}</span>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="max-pages" className="w-20 shrink-0 text-xs text-muted-foreground">
                Maximum
              </label>
              <input
                id="max-pages"
                type="range"
                min={5}
                max={200}
                step={5}
                value={max}
                onChange={(event) => setHigh(Number(event.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
              <span className="tabular w-12 shrink-0 text-right text-sm">{max}</span>
            </div>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-subtle-foreground">
            Estimated from your own font size, line spacing and margins — about{" "}
            <span className="tabular">{wordsPerPage}</span> words a page. Change those and this
            moves with them.
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="recency" className="text-sm font-medium">
              How recent must sources be?
            </label>
            <span className="text-sm text-muted-foreground">
              {recency === 0
                ? "Any age"
                : `Published ${thisYear - recency + 1} or later · last ${recency} years`}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">Any age</span>
            <input
              id="recency"
              type="range"
              min={0}
              max={20}
              step={1}
              value={recency}
              onChange={(event) => {
                setRecency(Number(event.target.value));
                setSaved(false);
              }}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <span className="tabular w-12 shrink-0 text-right text-sm">
              {recency === 0 ? "—" : `${recency}y`}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-subtle-foreground">
            Many departments ask for recent literature. This filters the search itself, so older
            work is never returned — narrow it too far on a small topic and there may be little
            to find.
          </p>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Save
        </Button>
        {saved ? (
          <span role="status" className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}
