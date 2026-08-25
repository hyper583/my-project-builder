"use client";

import type { Editor } from "@tiptap/react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { PanelLeft, Sparkles } from "lucide-react";

import { LockedSection } from "@/components/payments/locked-section";
import { useRegisterSections } from "@/components/shell/palette-scope";
import { Sheet } from "@/components/ui/sheet";
import { SectionEditor } from "@/components/workspace/section-editor";
import type { ChatMessage } from "@/components/workspace/assistant-chat";
import { AssistantPanel, ProjectNav, type NavChapter } from "@/components/workspace/panels";
import { plainTextToHtml } from "@/lib/rich-text";
import { useMediaQuery } from "@/lib/use-client-store";

export interface WorkspaceSection {
  id: string;
  number: string | null;
  title: string;
  content: string | null;
  /**
   * Beyond what this project's allowance covers. `content` is always null when
   * this is set — the server withholds it rather than trusting this flag, so a
   * bug here is a display fault and not a disclosure.
   */
  locked: boolean;
  placeholders: number;
}

/**
 * The three-panel workspace.
 *
 * Wide screens show navigation, document and assistant together. Below `lg`
 * the document keeps the screen and the two side panels become bottom sheets,
 * which is the one arrangement where a panel can comment on the document
 * without hiding it. Full-screen takeovers lose exactly the context the panels
 * exist to refer to.
 *
 * Each side panel is mounted in one place only, chosen by `isWide` rather than
 * rendered into both and hidden with CSS: two AssistantPanels would carry two
 * independent conversation states, and the one you could not see would be the
 * one that got out of step.
 */
export function WorkspaceShell({
  projectId,
  projectTitle,
  chapters,
  sections,
  aiConfigured,
  initialMessages,
  initialConversationId,
}: {
  projectId: string;
  projectTitle: string;
  chapters: NavChapter[];
  sections: WorkspaceSection[];
  aiConfigured: boolean;
  initialMessages: ChatMessage[];
  initialConversationId: string | null;
}) {
  const firstId = sections[0]?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(firstId);
  const [selection, setSelection] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const isWide = useMediaQuery("(min-width: 1024px)");

  const active = useMemo(
    () => sections.find((s) => s.id === activeId) ?? null,
    [sections, activeId],
  );

  const applyRevision = useCallback(
    (text: string) => {
      if (!editor) return;

      /*
       * Converted to paragraph markup before it goes in.
       *
       * Handed the raw string, `insertContent` puts a multi-paragraph answer
       * into one paragraph and keeps the newlines as literal characters, which
       * render as nothing. An accepted "Expand" arrived as a single 2,400
       * character block — the suggestion the student read and the text they
       * got were not the same shape.
       */
      const html = plainTextToHtml(text);
      if (!html) return;

      // Replaces exactly what the student had highlighted, so an accepted
      // revision lands where they expect and stays undoable.
      editor.chain().focus().insertContent(html).run();
      setSelection("");
    },
    [editor],
  );

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setSelection("");
    setNavOpen(false);
  }, []);

  // Contribute this project's sections to the command palette in the shell
  // above. Memoised because the hook re-registers whenever either argument
  // changes identity.
  const paletteSections = useMemo(
    () => sections.map(({ id, number, title }) => ({ id, number, title })),
    [sections],
  );
  useRegisterSections(paletteSections, handleSelect);

  // `hideTitle` is set in the sheet variants: the sheet header already names
  // the panel, and printing it twice makes the panel look dropped in.
  const nav = (hideTitle: boolean) => (
    <ProjectNav
      chapters={chapters}
      activeId={activeId}
      onSelect={handleSelect}
      hideTitle={hideTitle}
    />
  );

  const assistant = (hideTitle: boolean) => (
    <AssistantPanel
      projectId={projectId}
      sectionId={activeId}
      selection={selection}
      aiConfigured={aiConfigured}
      onApply={applyRevision}
      initialMessages={initialMessages}
      initialConversationId={initialConversationId}
      hideTitle={hideTitle}
    />
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open project sections"
            className="focus-glow flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground lg:hidden"
          >
            <PanelLeft className="size-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <p className="label-caps hidden sm:block">Workspace</p>
            <h1 className="truncate text-[0.9375rem] font-semibold tracking-[-0.018em]">
              {projectTitle}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/projects/${projectId}/blueprint`}
            className="focus-glow hidden rounded-md px-2 py-1 text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline sm:block"
          >
            Blueprint
          </Link>
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            aria-label="Open AI assistant"
            className="focus-glow flex size-9 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground lg:hidden"
          >
            <Sparkles className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[16rem_minmax(0,1fr)_21rem]">
        <div className="hidden min-h-0 border-r border-border bg-surface lg:block">
          {isWide ? nav(false) : null}
        </div>

        <div className="flex min-h-0 flex-col">
          {active && active.locked ? (
            <LockedSection
              projectId={projectId}
              sectionTitle={active.title}
              sectionNumber={active.number}
            />
          ) : active ? (
            <SectionEditor
              key={active.id}
              projectId={projectId}
              section={active}
              onSelectionChange={setSelection}
              onReady={setEditor}
            />
          ) : (
            <div className="p-8 text-center">
              <p className="leading-relaxed text-muted-foreground">
                This project has no sections yet.{" "}
                <Link
                  href={`/projects/${projectId}/wizard/9`}
                  className="text-primary underline underline-offset-4"
                >
                  Choose a chapter structure
                </Link>{" "}
                to begin.
              </p>
            </div>
          )}
        </div>

        <div className="hidden min-h-0 border-l border-border bg-surface lg:block">
          {isWide ? assistant(false) : null}
        </div>
      </div>

      {/* Below `lg` the same two panels arrive as sheets over the document. */}
      {!isWide && navOpen ? (
        <Sheet title="Contents" onClose={() => setNavOpen(false)}>
          {nav(true)}
        </Sheet>
      ) : null}

      {!isWide && assistantOpen ? (
        <Sheet title="AI assistant" onClose={() => setAssistantOpen(false)} className="h-[85vh]">
          {assistant(true)}
        </Sheet>
      ) : null}
    </div>
  );
}
