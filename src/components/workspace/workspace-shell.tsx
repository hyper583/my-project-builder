"use client";

import type { Editor } from "@tiptap/react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { PanelLeft, PanelRight } from "lucide-react";

import { SectionEditor } from "@/components/workspace/section-editor";
import type { ChatMessage } from "@/components/workspace/assistant-chat";
import { AssistantPanel, ProjectNav, type NavChapter } from "@/components/workspace/panels";

export interface WorkspaceSection {
  id: string;
  number: string | null;
  title: string;
  content: string | null;
  placeholders: number;
}

/**
 * The three-panel workspace.
 *
 * Desktop shows navigation, document and assistant together. Below `lg` the
 * side panels become toggles over the document rather than being duplicated as
 * a cramped three-column layout — the brief asks for an optimised mobile
 * experience, not a miniature of the desktop one.
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

  const active = useMemo(
    () => sections.find((s) => s.id === activeId) ?? null,
    [sections, activeId],
  );

  const applyRevision = useCallback(
    (text: string) => {
      if (!editor) return;
      // Replaces exactly what the student had highlighted, so an accepted
      // revision lands where they expect and stays undoable.
      editor.chain().focus().insertContent(text).run();
      setSelection("");
    },
    [editor],
  );

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setSelection("");
    setNavOpen(false);
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle project navigation"
            aria-expanded={navOpen}
            className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted lg:hidden"
          >
            <PanelLeft className="size-4" aria-hidden="true" />
          </button>
          <h1 className="truncate font-serif text-lg font-semibold">{projectTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/blueprint`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Blueprint
          </Link>
          <button
            type="button"
            onClick={() => setAssistantOpen((v) => !v)}
            aria-label="Toggle AI assistant"
            aria-expanded={assistantOpen}
            className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted lg:hidden"
          >
            <PanelRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <div
          className={`min-h-0 border-r border-border bg-card ${navOpen ? "block" : "hidden"} lg:block`}
        >
          <ProjectNav chapters={chapters} activeId={activeId} onSelect={handleSelect} />
        </div>

        <div className={`flex min-h-0 flex-col ${navOpen || assistantOpen ? "hidden" : "flex"} lg:flex`}>
          {active ? (
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

        <div
          className={`min-h-0 border-l border-border bg-card ${assistantOpen ? "block" : "hidden"} lg:block`}
        >
          <AssistantPanel
            projectId={projectId}
            sectionId={activeId}
            selection={selection}
            aiConfigured={aiConfigured}
            onApply={applyRevision}
            initialMessages={initialMessages}
            initialConversationId={initialConversationId}
          />
        </div>
      </div>
    </div>
  );
}
