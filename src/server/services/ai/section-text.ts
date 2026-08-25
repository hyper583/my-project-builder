import { parse } from "node-html-parser";

/**
 * A section's prose, as the model should read it.
 *
 * The assistant used to be told only which section the student was looking at —
 * its number and title — and not a word of what it said. Asked "what is missing
 * from 1.1", it answered "I can't see the text of 1.1 from here — paste it in".
 * The student was looking straight at it. That is the product asking them to do
 * the one thing it exists to save them.
 *
 * Stored content is editor HTML, so it is converted rather than sent raw: tags
 * would spend tokens and invite the model to answer in markup.
 */

/**
 * How much of a section to send.
 *
 * A written section runs to roughly 3,000–9,000 characters, so this covers most
 * of them whole. It is a bound rather than a budget — input tokens are cheap
 * next to output, and the cost of truncating mid-argument is an answer about
 * half a section.
 */
export const SECTION_CONTEXT_LIMIT = 6000;

/**
 * Tags that end a paragraph-level block, which is a blank line.
 *
 * Separate from the list below because the gap has to match what it means. A
 * heading run together with the paragraph under it reads as one sentence, while
 * blank lines between every bullet turns a list of objectives into a page.
 */
const PARAGRAPH_TAGS = /<\/(p|div|h[1-6]|blockquote|figcaption)>/gi;

/** Tags that end a line within a block — one newline, no gap. */
const LINE_TAGS = /<\/(li|tr)>/gi;

export function sectionPlainText(
  html: string | null | undefined,
  limit: number = SECTION_CONTEXT_LIMIT,
): string | null {
  if (!html?.trim()) return null;

  // Block boundaries are inserted before the tags are stripped. Taking the
  // text content straight off the tree runs paragraphs together, so the model
  // receives one unbroken wall and loses the structure it is being asked about.
  const spaced = html
    .replace(PARAGRAPH_TAGS, (tag) => `${tag}\n\n`)
    .replace(LINE_TAGS, (tag) => `${tag}\n`)
    .replace(/<br\s*\/?>/gi, "\n");

  const text = parse(spaced, { lowerCaseTagName: true, comment: false })
    .textContent // Collapse runs of blank lines, but keep one as a paragraph break.
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  if (!text) return null;

  return text.length > limit ? `${text.slice(0, limit).trimEnd()}\n\n[…section continues]` : text;
}
