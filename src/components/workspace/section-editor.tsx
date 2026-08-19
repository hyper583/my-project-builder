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
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-border bg-card px-4 py-2">
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
    <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm text-muted-foreground">
      <span aria-live="polite" className={`flex min-h-5 items-center gap-1.5 ${state === "error" || state === "offline" ? "text-destructive" : ""}`}>
        {label}
      </span>
      <span className="tabular-nums">{words} words</span>
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
  section: { id: string; number: string | null; title: string; content: string | null };
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
          "prose-editor min-h-[24rem] px-4 py-5 outline-none [&_p]:mb-4 [&_p]:leading-relaxed [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_a]:text-primary [&_a]:underline",
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
      <div className="border-b border-border px-4 py-3">
        <h1 className="font-serif text-2xl font-semibold">
          {section.number ? `${section.number} ` : ""}
          {section.title}
        </h1>
      </div>
      <Toolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
      <SaveIndicator state={state} words={words} />
    </div>
  );
}
