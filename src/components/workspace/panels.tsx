"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AI_ACTIONS } from "@/lib/ai-actions";
import { runAiAction } from "@/server/actions/ai-edit";

export interface NavSection {
  id: string;
  number: string | null;
  title: string;
  hasContent: boolean;
  placeholders: number;
}

export interface NavChapter extends NavSection {
  children: NavSection[];
}

/** Left panel — the project's structure, with what still needs data marked. */
export function ProjectNav({
  chapters,
  activeId,
  onSelect,
}: {
  chapters: NavChapter[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Project sections" className="h-full overflow-y-auto p-3">
      <p className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Project
      </p>
      <ol className="space-y-3">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <p className="px-2 py-1 text-sm font-semibold">
              {chapter.number ? `${chapter.number}. ` : ""}
              {chapter.title}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {chapter.children.map((section) => {
                const active = section.id === activeId;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(section.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-200 ${
                        active ? "bg-primary/10 font-medium" : "hover:bg-muted"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-muted-foreground tabular-nums">
                          {section.number ? `${section.number} ` : ""}
                        </span>
                        {section.title}
                      </span>
                      {section.placeholders > 0 ? (
                        <span
                          title={`${section.placeholders} place${section.placeholders === 1 ? "" : "s"} needing your data`}
                          className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-warning"
                        >
                          <TriangleAlert className="size-3" aria-hidden="true" />
                          {section.placeholders}
                        </span>
                      ) : !section.hasContent ? (
                        <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">empty</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Right panel — selection actions and their results.
 *
 * A result is never written into the document automatically. The student
 * chooses to apply it, which keeps authorship theirs and makes an unwanted
 * rewrite a non-event rather than something to undo.
 */
export function AssistantPanel({
  projectId,
  sectionId,
  selection,
  aiConfigured,
  onApply,
}: {
  projectId: string;
  sectionId: string | null;
  selection: string;
  aiConfigured: boolean;
  onApply: (text: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; replaces: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = selection.trim().length > 0;
  const disabled = !aiConfigured || !hasSelection || !sectionId || pending !== null;

  return (
    <aside aria-label="AI assistant" className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          AI assistant
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {!aiConfigured
            ? "AI isn't configured on this installation, so these actions are unavailable."
            : hasSelection
              ? "Choose what to do with the text you've highlighted."
              : "Highlight some text in your document to see what you can do with it."}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {hasSelection ? (
          <blockquote className="mb-3 max-h-28 overflow-y-auto rounded-md border border-border bg-muted/40 p-2 text-sm leading-relaxed text-muted-foreground">
            {selection.slice(0, 400)}
            {selection.length > 400 ? "…" : ""}
          </blockquote>
        ) : null}

        <ul className="space-y-1">
          {AI_ACTIONS.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                disabled={disabled}
                title={action.description}
                onClick={async () => {
                  if (!sectionId) return;
                  setPending(action.key);
                  setError(null);
                  setResult(null);
                  const response = await runAiAction({
                    projectId,
                    sectionId,
                    actionKey: action.key,
                    selection,
                  });
                  setPending(null);
                  if (response.ok) setResult(response.data);
                  else setError(response.message);
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                <span>{action.label}</span>
                {pending === action.key ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>

        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-md border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {result.replaces ? "Suggested revision" : "Assistant"}
            </p>
            <div className="max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
              {result.text}
            </div>
            {result.replaces ? (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onApply(result.text);
                    setResult(null);
                  }}
                >
                  Replace selection
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                  Discard
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => setResult(null)}>
                Dismiss
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
