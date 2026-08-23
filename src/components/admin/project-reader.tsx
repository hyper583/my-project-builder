"use client";

import { useState, useTransition } from "react";
import { AlertCircle, BookOpen, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { revealProjectContent, type RevealedSection } from "@/server/actions/admin";

/**
 * The gate in front of a student's writing.
 *
 * It states plainly what pressing the button does, before it is pressed. The
 * audit row is not a disclosure buried in a policy — it is the thing that makes
 * this capability defensible, so the person using it should be told at the
 * moment of use.
 *
 * Once revealed, the content renders read-only. Nothing here can write to the
 * project: support can investigate a complaint without being able to alter the
 * work it is about.
 */
export function ProjectReader({
  projectId,
  ownerEmail,
  sectionCount,
}: {
  projectId: string;
  ownerEmail: string;
  sectionCount: number;
}) {
  const [sections, setSections] = useState<RevealedSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealProjectContent({ projectId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSections(result.data.sections);
    });
  }

  if (sections === null) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning-subtle p-5">
        <h2 className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-0.014em] text-warning">
          <BookOpen className="size-4" aria-hidden="true" />
          This is {ownerEmail}&apos;s unpublished work
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-warning">
          Opening it records your name, this project and the time. That record cannot be
          removed from the console. Everything above this point is metadata and is not
          recorded.
        </p>

        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <Button variant="outline" className="mt-4" disabled={pending} onClick={reveal}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Read {sectionCount} section{sectionCount === 1 ? "" : "s"}, and record it
        </Button>
      </div>
    );
  }

  const written = sections.filter((section) => section.content.trim().length > 0);

  return (
    <div className="space-y-4">
      <p className="mono text-[0.6875rem] tracking-[0.06em] text-warning uppercase">
        Read and recorded · {written.length} of {sections.length} sections have content
      </p>

      {written.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground elevated-1">
          Every section is empty. Nothing has been generated or written yet.
        </p>
      ) : (
        written.map((section) => (
          <article key={section.id} className="rounded-xl border border-border bg-card elevated-1">
            <header className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
              <h3 className="flex items-baseline gap-2.5 text-sm font-semibold tracking-[-0.014em]">
                {section.number ? (
                  <span className="mono text-[0.6875rem] text-subtle-foreground">
                    {section.number}
                  </span>
                ) : null}
                {section.title}
              </h3>
              <span className="mono shrink-0 text-[0.625rem] text-subtle-foreground">
                {section.words} words
              </span>
            </header>

            {/*
             * Rendered as text rather than HTML. The stored content is the
             * student's own editor output, and an admin console is the last
             * place that should be executing it — reading someone's work must
             * never become a way to run script in an admin's session.
             */}
            <div className="document measure px-5 py-4 text-[0.9375rem] whitespace-pre-wrap">
              {section.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
