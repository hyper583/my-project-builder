import { parse, type HTMLElement, type Node } from "node-html-parser";

import { PLACEHOLDER_PATTERN } from "@/lib/placeholders";

/**
 * The canonical export document.
 *
 * One model, consumed by every renderer. DOCX and PDF never read the database
 * or parse HTML themselves, so a change to what a document contains lands in
 * both formats at once and they cannot drift apart — which matters most for
 * the demo disclaimer, where a renderer quietly omitting something is the
 * failure the whole policy exists to prevent.
 */

export type Inline =
  | { kind: "text"; text: string; bold?: boolean; italic?: boolean; strike?: boolean }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "paragraph"; runs: Inline[] }
  | { kind: "heading"; level: 2 | 3; runs: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; rows: Array<{ header: boolean; cells: Inline[][] }> }
  /** A tracked `[STUDENT DATA REQUIRED: …]` marker, kept visible in the output. */
  | { kind: "placeholder"; label: string }
  | { kind: "image"; alt: string };

export interface ExportSection {
  number: string | null;
  title: string;
  blocks: Block[];
}

export interface ExportChapter {
  number: string | null;
  title: string;
  /** Prose written directly on the chapter, before its first section. */
  blocks: Block[];
  sections: ExportSection[];
}

/**
 * What must be stamped on a demo export.
 *
 * Present or absent as a whole — never partially applied. A renderer reports
 * back what it actually drew, and `assertDisclaimer` fails the export if that
 * does not match the resolved policy.
 */
export interface DisclaimerSpec {
  /** Full-width block on the title page. */
  readonly titleBlock: string;
  /** Repeated in the footer of every page. */
  readonly runningFooter: string;
  /** Diagonal page watermark. */
  readonly watermark: string;
}

/**
 * Page and type settings carried from the student's formatting step.
 *
 * Held on the document rather than passed to each renderer separately, so
 * DOCX and PDF cannot end up laying the same project out differently.
 */
export interface ExportFormatting {
  font: string;
  fontSizePt: number;
  /** 1 = single, 1.5, 2 = double. */
  lineSpacing: number;
  marginInches: { top: number; right: number; bottom: number; left: number };
}

/** Used when a project has not reached the formatting step. */
export const DEFAULT_FORMATTING: ExportFormatting = {
  font: "Times New Roman",
  fontSizePt: 12,
  lineSpacing: 2,
  marginInches: { top: 1, right: 1, bottom: 1, left: 1.5 },
};

export interface ExportDocument {
  title: string;
  topic: string | null;
  author: string;
  institution: string | null;
  faculty: string | null;
  department: string | null;
  programme: string | null;
  degree: string | null;
  /** Rendered as written; never reformatted into a different calendar. */
  dateLabel: string;
  chapters: ExportChapter[];
  references: string[];
  formatting: ExportFormatting;
  /** Null for a real project, and for an admin's deliberately clean export. */
  disclaimer: DisclaimerSpec | null;
}

/**
 * What a renderer actually produced.
 *
 * `disclaimerRendered` is reported by the renderer rather than assumed by the
 * caller, so `assertDisclaimer` is checking a fact about the bytes on disk.
 * A renderer that silently skipped the marking fails the export.
 */
export interface RenderResult {
  bytes: Uint8Array;
  contentType: string;
  extension: "docx" | "pdf";
  disclaimerRendered: boolean;
}

/** The wording used wherever a demo export is marked. */
export const DEMO_DISCLAIMER: DisclaimerSpec = {
  titleBlock:
    "SAMPLE PROJECT — NOT REAL RESEARCH. This document was produced as an illustration of " +
    "document structure and formatting. Its results, percentages, respondent numbers and " +
    "findings are fabricated. It describes no real study, no real participants and no real " +
    "data, and must not be submitted as academic work.",
  runningFooter: "SAMPLE PROJECT — illustrative content, not real research",
  watermark: "SAMPLE",
};


function textOf(node: Node): string {
  return node.textContent ?? "";
}

/**
 * Collects the inline runs inside an element, preserving emphasis.
 *
 * Nested marks are flattened rather than nested, because both renderers apply
 * formatting per run. Bold-inside-italic therefore arrives as a single run
 * carrying both flags.
 */
function readInlines(
  element: HTMLElement,
  inherited: { bold?: boolean; italic?: boolean; strike?: boolean } = {},
): Inline[] {
  const runs: Inline[] = [];

  for (const child of element.childNodes) {
    // Text node.
    if (!(child as HTMLElement).tagName) {
      const text = textOf(child);
      if (text) runs.push({ kind: "text", text, ...inherited });
      continue;
    }

    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      runs.push({ kind: "text", text: "\n", ...inherited });
      continue;
    }
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      const text = el.textContent ?? "";
      if (text) runs.push(href ? { kind: "link", text, href } : { kind: "text", text, ...inherited });
      continue;
    }
    if (tag === "img") {
      continue; // handled at block level
    }

    const marks = {
      bold: inherited.bold || tag === "strong" || tag === "b",
      italic: inherited.italic || tag === "em" || tag === "i",
      strike: inherited.strike || tag === "s" || tag === "del",
    };
    runs.push(...readInlines(el, marks));
  }

  return runs.filter((run) => run.text.length > 0);
}

/** Splits a paragraph's runs so tracked markers become their own blocks. */
function splitPlaceholders(runs: Inline[]): Block[] {
  const joined = runs.map((r) => r.text).join("");
  PLACEHOLDER_PATTERN.lastIndex = 0;
  if (!PLACEHOLDER_PATTERN.test(joined)) {
    return runs.length > 0 ? [{ kind: "paragraph", runs }] : [];
  }

  // A marker is a statement about the document, not prose, so it is lifted out
  // and rendered distinctly rather than left inline where it reads as text.
  const blocks: Block[] = [];
  let cursor = 0;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  for (const match of joined.matchAll(PLACEHOLDER_PATTERN)) {
    const before = joined.slice(cursor, match.index).trim();
    if (before) blocks.push({ kind: "paragraph", runs: [{ kind: "text", text: before }] });
    blocks.push({ kind: "placeholder", label: match[1]!.trim() });
    cursor = (match.index ?? 0) + match[0].length;
  }
  const after = joined.slice(cursor).trim();
  if (after) blocks.push({ kind: "paragraph", runs: [{ kind: "text", text: after }] });
  return blocks;
}

/**
 * Converts a section's stored HTML into renderer-neutral blocks.
 *
 * The editor writes a small, known subset of HTML, so the parse is narrow on
 * purpose: anything unrecognised falls back to its text rather than being
 * dropped, because losing a student's writing is far worse than losing its
 * formatting.
 */
export function parseSectionHtml(html: string | null): Block[] {
  if (!html?.trim()) return [];

  const root = parse(html, { lowerCaseTagName: true, comment: false });
  const blocks: Block[] = [];

  const walk = (element: HTMLElement) => {
    for (const child of element.childNodes) {
      const el = child as HTMLElement;
      if (!el.tagName) {
        const stray = textOf(el).trim();
        if (stray) blocks.push(...splitPlaceholders([{ kind: "text", text: stray }]));
        continue;
      }

      switch (el.tagName.toLowerCase()) {
        case "p":
          blocks.push(...splitPlaceholders(readInlines(el)));
          break;

        case "h1":
        case "h2":
          blocks.push({ kind: "heading", level: 2, runs: readInlines(el) });
          break;
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          blocks.push({ kind: "heading", level: 3, runs: readInlines(el) });
          break;

        case "ul":
        case "ol": {
          const items = el
            .querySelectorAll("li")
            .map((li) => readInlines(li))
            .filter((runs) => runs.length > 0);
          if (items.length > 0) {
            blocks.push({ kind: "list", ordered: el.tagName.toLowerCase() === "ol", items });
          }
          break;
        }

        case "table": {
          const rows = el.querySelectorAll("tr").map((tr) => {
            const cellNodes = tr.querySelectorAll("th, td");
            return {
              header: cellNodes.length > 0 && cellNodes[0]!.tagName.toLowerCase() === "th",
              cells: cellNodes.map((cell) => readInlines(cell)),
            };
          });
          if (rows.length > 0) blocks.push({ kind: "table", rows });
          break;
        }

        case "img":
          blocks.push({ kind: "image", alt: el.getAttribute("alt") ?? "Figure" });
          break;

        case "blockquote":
        case "div":
        case "section":
          walk(el);
          break;

        default: {
          // Unknown element: keep the words.
          const text = el.textContent?.trim();
          if (text) blocks.push(...splitPlaceholders([{ kind: "text", text }]));
        }
      }
    }
  };

  walk(root);
  return blocks;
}

/** Counts tracked markers across a document — surfaced in the export preview. */
export function countPlaceholders(document: ExportDocument): number {
  let total = 0;
  for (const chapter of document.chapters) {
    total += chapter.blocks.filter((b) => b.kind === "placeholder").length;
    for (const section of chapter.sections) {
      total += section.blocks.filter((b) => b.kind === "placeholder").length;
    }
  }
  return total;
}

/** Words in the body text, ignoring markers and structural labels. */
export function countWords(document: ExportDocument): number {
  const fromBlocks = (blocks: Block[]): number =>
    blocks.reduce((sum, block) => {
      if (block.kind === "paragraph" || block.kind === "heading") {
        return sum + block.runs.map((r) => r.text).join(" ").split(/\s+/).filter(Boolean).length;
      }
      if (block.kind === "list") {
        return (
          sum +
          block.items.flat().map((r) => r.text).join(" ").split(/\s+/).filter(Boolean).length
        );
      }
      if (block.kind === "table") {
        return (
          sum +
          block.rows
            .flatMap((row) => row.cells.flat())
            .map((r) => r.text)
            .join(" ")
            .split(/\s+/)
            .filter(Boolean).length
        );
      }
      return sum;
    }, 0);

  return document.chapters.reduce(
    (sum, chapter) =>
      sum +
      fromBlocks(chapter.blocks) +
      chapter.sections.reduce((s, section) => s + fromBlocks(section.blocks), 0),
    0,
  );
}
