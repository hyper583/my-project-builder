"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AssistantChat, type ChatMessage } from "@/components/workspace/assistant-chat";
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
  hideTitle = false,
}: {
  chapters: NavChapter[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Set when the panel is inside a sheet that already shows its title. */
  hideTitle?: boolean;
}) {
  return (
    <nav aria-label="Project sections" className="h-full overflow-y-auto p-3">
      {hideTitle ? null : <p className="label-caps px-2 pb-2.5">Contents</p>}
      <ol className="space-y-4">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <p className="flex items-baseline gap-2 px-2 py-1">
              {chapter.number ? (
                <span className="mono shrink-0 text-[0.625rem] text-subtle-foreground">
                  {chapter.number}
                </span>
              ) : null}
              <span className="text-[0.8125rem] font-semibold tracking-[-0.01em]">
                {chapter.title}
              </span>
            </p>
            <ul className="mt-0.5 space-y-0.5 border-l border-border pl-2">
              {chapter.children.map((section) => {
                const active = section.id === activeId;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(section.id)}
                      aria-current={active ? "true" : undefined}
                      className={`focus-glow relative flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-[0.8125rem] transition-colors duration-150 ${
                        active
                          ? "bg-primary-subtle font-medium text-foreground before:absolute before:top-1 before:bottom-1 before:-left-2 before:w-0.5 before:rounded-full before:bg-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        {section.number ? (
                          <span className="mono mr-1.5 text-[0.625rem] text-subtle-foreground">
                            {section.number}
                          </span>
                        ) : null}
                        {section.title}
                      </span>
                      {/*
                       * The placeholder count is the honest measure of how much
                       * of this section still needs the student's own data, so
                       * it sits where they can see it without opening anything.
                       */}
                      {section.placeholders > 0 ? (
                        <span
                          title={`${section.placeholders} place${section.placeholders === 1 ? "" : "s"} needing your data`}
                          className="mono mt-0.5 flex shrink-0 items-center gap-0.5 rounded bg-warning-subtle px-1 text-[0.625rem] text-warning"
                        >
                          <TriangleAlert className="size-2.5" aria-hidden="true" />
                          {section.placeholders}
                        </span>
                      ) : !section.hasContent ? (
                        <span className="mono mt-0.5 shrink-0 text-[0.625rem] text-subtle-foreground">
                          empty
                        </span>
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
  initialMessages,
  initialConversationId,
  hideTitle = false,
}: {
  projectId: string;
  sectionId: string | null;
  selection: string;
  aiConfigured: boolean;
  onApply: (text: string) => void;
  initialMessages: ChatMessage[];
  initialConversationId: string | null;
  /** Set when the panel is inside a sheet that already shows its title. */
  hideTitle?: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; replaces: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "actions">("chat");

  const hasSelection = selection.trim().length > 0;
  const disabled = !aiConfigured || !hasSelection || !sectionId || pending !== null;

  return (
    <aside aria-label="AI assistant" className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border bg-surface px-4 pt-3">
        {/* Inside a sheet the title is already on the sheet's own header, and
            printing it twice makes the panel look like it was dropped in. */}
        {hideTitle ? null : (
          <h2 className="flex items-center gap-2 text-[0.8125rem] font-semibold tracking-[-0.01em]">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            AI assistant
          </h2>
        )}
        <div role="tablist" aria-label="Assistant mode" className={`flex gap-1 ${hideTitle ? "" : "mt-3"}`}>
          {(["chat", "actions"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`focus-glow cursor-pointer rounded-t-md border-b-2 px-3 py-1.5 text-[0.8125rem] transition-colors duration-200 ${
                tab === value
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "chat" ? "Chat" : "Selection"}
              {/* Only when there is a selection to act on — a badge that is
                  always there stops meaning anything. */}
              {value === "actions" && hasSelection ? (
                <span className="mono ml-1.5 rounded-full bg-primary-subtle px-1.5 text-[0.625rem] text-primary">
                  1
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {tab === "chat" ? (
        <AssistantChat
          projectId={projectId}
          sectionId={sectionId}
          aiConfigured={aiConfigured}
          initialMessages={initialMessages}
          initialConversationId={initialConversationId}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
            {!aiConfigured
              ? "AI isn't configured on this installation, so these actions are unavailable."
              : hasSelection
                ? "Choose what to do with the text you've highlighted."
                : "Highlight some text in your document to see what you can do with it."}
          </p>
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
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition-colors duration-150 hover:border-border-strong hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
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
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          {result ? (
            <div className="mt-4 rounded-lg border border-border bg-card p-3 elevated-2">
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
      )}
    </aside>
  );
}
