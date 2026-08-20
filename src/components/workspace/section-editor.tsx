"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Check,
  CloudOff,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Redo2,
  Table as TableIcon,
  TriangleAlert,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

import { LIMITS } from "@/config/limits";
import { saveSection } from "@/server/actions/sections";

type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

/**
 * Converts stored plain text into paragraphs.
 *
 * Generated sections are written as plain text by the pipeline; once edited
 * here they are stored as HTML. Detecting which we have avoids showing a wall
 * of unbroken text the first time a generated section is opened.
 */
function toEditorHtml(content: string | null): string {
  if (!content) return "";
  if (/^\s*<(p|h[1-6]|ul|ol|table|blockquote)\b/i.test(content)) return content;
  return content
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br />").replace(/</g, "&lt;")}</p>`)
    .join("");
}

/** Counts words in stored content, whether it is HTML or plain text. */
function countWords(content: string | null): number {
  if (!content) return 0;
  return content
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function ToolbarButton({
  onClick,
  active,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex size-9 cursor-pointer items-center justify-center rounded-md border transition-colors duration-200 disabled:pointer-events-none disabled:opacity-40 ${
        active
          ? "border-primary bg-muted text-foreground"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur-sm">
      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <UnderlineIcon className="size-4" aria-hidden="true" />
      </ToolbarButton>

      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      {([2, 3] as const).map((level) => (
        <ToolbarButton
          key={level}
          label={`Heading ${level}`}
          active={editor.isActive("heading", { level })}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
        >
          <span className="text-sm font-semibold">H{level}</span>
        </ToolbarButton>
      ))}

      <ToolbarButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" aria-hidden="true" />
      </ToolbarButton>

      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      <ToolbarButton
        label="Insert table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Add link"
        active={editor.isActive("link")}
        onClick={() => {
          const previous = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", previous ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().unsetLink().run();
            return;
          }
          editor.chain().focus().setLink({ href: url }).run();
        }}
      >
        <LinkIcon className="size-4" aria-hidden="true" />
      </ToolbarButton>

      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="size-4" aria-hidden="true" />
      </ToolbarButton>
    </div>
  );
}

function SaveIndicator({ state, words }: { state: SaveState; words: number }) {
  const label = {
    idle: null,
    saving: (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Saving…
      </>
    ),
    saved: (
      <>
        <Check className="size-3.5" aria-hidden="true" /> Saved
      </>
    ),
    offline: (
      <>
        <CloudOff className="size-3.5" aria-hidden="true" /> Offline — changes kept, will save when you reconnect
      </>
    ),
    error: (
      <>
        <CloudOff className="size-3.5" aria-hidden="true" /> Couldn&apos;t save — we&apos;ll retry on your next edit
      </>
    ),
  }[state];

  return (
    <div className="flex items-center justify-between border-t border-border bg-surface px-5 py-2 text-sm text-muted-foreground">
      <span aria-live="polite" className={`flex min-h-5 items-center gap-1.5 ${state === "error" || state === "offline" ? "text-destructive" : ""}`}>
        {label}
      </span>
      <span className="tabular">{words.toLocaleString()} words</span>
    </div>
  );
}

export function SectionEditor({
  projectId,
  section,
  onSelectionChange,
  onReady,
}: {
  projectId: string;
  section: {
    id: string;
    number: string | null;
    title: string;
    content: string | null;
    /** Unresolved [STUDENT DATA REQUIRED] markers, surfaced in the header. */
    placeholders: number;
  };
  /** Lets the assistant panel act on whatever the student has highlighted. */
  onSelectionChange?: (selection: string) => void;
  /** Hands the editor instance up so the assistant can apply a revision. */
  onReady?: (editor: Editor | null) => void;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const [words, setWords] = useState(() => countWords(section.content));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const latest = useRef<{ html: string; text: string }>({ html: "", text: "" });

  const flush = useCallback(async () => {
    if (!dirty.current) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      // Say so plainly rather than showing "Saved" for something that is not.
      setState("offline");
      return;
    }

    dirty.current = false;
    setState("saving");
    const result = await saveSection({
      projectId,
      sectionId: section.id,
      html: latest.current.html,
      text: latest.current.text,
    });

    if (result.ok) {
      setState("saved");
      setWords(result.data.wordCount);
    } else {
      setState("error");
      dirty.current = true; // retry on the next edit
    }
  }, [projectId, section.id]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // StarterKit bundles its own Link. Ours needs different options, so its
      // copy is switched off rather than registered twice.
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: "Start writing this section, or ask the assistant for a draft…",
      }),
    ],
    content: toEditorHtml(section.content),
    editorProps: {
      attributes: {
        class:
          // Padding now lives on the `.document` wrapper, which also owns the
          // reading measure — the editor surface itself just fills it.
          "prose-editor min-h-[24rem] outline-none [&_p]:mb-5 [&_h2]:mt-8 [&_h2]:mb-2.5 [&_h2]:text-[1.375rem] [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[1.1875rem] [&_h3]:font-semibold [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_a]:text-primary [&_a]:underline",
      },
    },
    onUpdate({ editor: instance }) {
      dirty.current = true;
      latest.current = { html: instance.getHTML(), text: instance.getText() };
      setWords(instance.getText().trim().split(/\s+/).filter(Boolean).length);
    },
    onSelectionUpdate({ editor: instance }) {
      if (!onSelectionChange) return;
      const { from, to } = instance.state.selection;
      onSelectionChange(from === to ? "" : instance.state.doc.textBetween(from, to, " "));
    },
  });

  // Debounced autosave.
  useEffect(() => {
    if (!editor) return;
    const onChange = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), LIMITS.wizard.autosaveDebounceMs);
    };
    editor.on("update", onChange);
    return () => {
      editor.off("update", onChange);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [editor, flush]);

  // Flush on tab hide, page unload, and unmount — a client-side navigation
  // between sections fires none of the first two.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onOnline = () => {
      if (dirty.current) void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", () => setState("offline"));
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onOnline);
      void flush();
    };
  }, [flush]);

  // Publish the instance so the assistant panel can replace a selection.
  useEffect(() => {
    onReady?.(editor);
    return () => onReady?.(null);
  }, [editor, onReady]);

  if (!editor) {
    return <div className="p-6 text-muted-foreground">Loading editor…</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-surface px-5 py-3.5">
        {/*
          h2, not h1: the workspace header already carries the project title as
          the page heading, and a section is a level below it. Two h1s on one
          page leaves a screen reader with no single answer to "what is this?".
        */}
        {/* Chrome, so sans: the serif starts below, where the document does. */}
        <h2 className="flex items-baseline gap-2.5 text-base font-semibold tracking-[-0.018em]">
          {section.number ? (
            <span className="mono text-[0.6875rem] font-medium text-subtle-foreground">
              {section.number}
            </span>
          ) : null}
          {section.title}
        </h2>
        {section.placeholders > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-warning-subtle px-2.5 py-0.5 text-xs font-medium text-warning">
            <TriangleAlert className="size-3" aria-hidden="true" />
            <span className="mono">{section.placeholders}</span> needing your data
          </span>
        ) : null}
      </div>
      <Toolbar editor={editor} />
      {/*
       * The document itself. `.document` is the only place the scholarly serif
       * appears, and `.measure` caps the line length — past about seventy
       * characters the eye starts losing the line return, and this is the one
       * surface in the product people read continuously rather than scan.
       */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        <div className="document measure mx-auto px-6 py-8 sm:px-8">
          <EditorContent editor={editor} />
        </div>
      </div>
      <SaveIndicator state={state} words={words} />
    </div>
  );
}
