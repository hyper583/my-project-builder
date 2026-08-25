import { describe, expect, it } from "vitest";

import {
  DEFAULT_FORMATTING,
  countPlaceholders,
  countWords,
  parseSectionHtml,
  type Block,
  type ExportDocument,
  type Inline,
} from "@/server/services/export/document";

/**
 * The HTML the editor stores is the export's only source of body text, so a
 * parsing mistake silently removes a student's writing from their submitted
 * document. These tests are weighted towards loss, not towards formatting.
 */

const text = (blocks: Block[]): string =>
  blocks
    .map((b) => {
      if (b.kind === "paragraph" || b.kind === "heading") return b.runs.map((r) => r.text).join("");
      if (b.kind === "list") return b.items.map((i) => i.map((r) => r.text).join("")).join(" ");
      if (b.kind === "table")
        return b.rows.map((r) => r.cells.map((c) => c.map((x) => x.text).join("")).join(" ")).join(" ");
      if (b.kind === "placeholder") return `[${b.label}]`;
      return "";
    })
    .join(" ");

describe("parseSectionHtml", () => {
  it("returns nothing for empty content", () => {
    expect(parseSectionHtml(null)).toEqual([]);
    expect(parseSectionHtml("")).toEqual([]);
    expect(parseSectionHtml("   ")).toEqual([]);
  });

  it("reads paragraphs and headings at the right level", () => {
    const blocks = parseSectionHtml(
      "<h2>Background</h2><p>The first paragraph.</p><h3>Sub</h3><p>Second.</p>",
    );
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "heading", "paragraph"]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
    expect(blocks[2]).toMatchObject({ kind: "heading", level: 3 });
  });

  it("preserves emphasis, including when marks are nested", () => {
    const blocks = parseSectionHtml("<p><strong>Bold <em>and italic</em></strong> plain.</p>");
    const runs = (blocks[0] as Extract<Block, { kind: "paragraph" }>).runs;

    const textRun = (needle: string) =>
      runs.find((r): r is Extract<Inline, { kind: "text" }> =>
        r.kind === "text" && r.text.includes(needle),
      );

    expect(textRun("Bold")).toMatchObject({ bold: true });
    // Nested marks flatten onto one run rather than nesting.
    expect(textRun("and italic")).toMatchObject({ bold: true, italic: true });
    expect(textRun("plain")?.bold).toBeFalsy();
  });

  it("keeps links with their destination", () => {
    const blocks = parseSectionHtml('<p>See <a href="https://example.org/paper">the paper</a>.</p>');
    const runs = (blocks[0] as Extract<Block, { kind: "paragraph" }>).runs;
    expect(runs).toContainEqual({
      kind: "link",
      text: "the paper",
      href: "https://example.org/paper",
    });
  });

  it("reads ordered and unordered lists", () => {
    const blocks = parseSectionHtml("<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol>");
    expect(blocks[0]).toMatchObject({ kind: "list", ordered: false });
    expect(blocks[1]).toMatchObject({ kind: "list", ordered: true });
    expect(text(blocks)).toContain("One");
    expect(text(blocks)).toContain("First");
  });

  it("reads tables and marks the header row", () => {
    const blocks = parseSectionHtml(
      "<table><tr><th>Variable</th><th>Measure</th></tr><tr><td>Usage</td><td>Hours</td></tr></table>",
    );
    const table = blocks[0] as Extract<Block, { kind: "table" }>;
    expect(table.kind).toBe("table");
    expect(table.rows[0]!.header).toBe(true);
    expect(table.rows[1]!.header).toBe(false);
    expect(text(blocks)).toContain("Hours");
  });

  it("lifts a tracked marker out of its paragraph", () => {
    // The marker is a statement about the document, not prose, so it becomes
    // its own block and can be rendered distinctly.
    const blocks = parseSectionHtml(
      "<p>Respondents reported [STUDENT DATA REQUIRED: mean satisfaction score] overall.</p>",
    );

    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "placeholder", "paragraph"]);
    expect(blocks[1]).toEqual({ kind: "placeholder", label: "mean satisfaction score" });
    expect(text(blocks)).toContain("Respondents reported");
    expect(text(blocks)).toContain("overall");
  });

  it("handles several markers in one paragraph", () => {
    const blocks = parseSectionHtml(
      "<p>A [STUDENT DATA REQUIRED: first] B [STUDENT DATA REQUIRED: second] C</p>",
    );
    const labels = blocks.filter((b) => b.kind === "placeholder").map((b) => b.label);
    expect(labels).toEqual(["first", "second"]);
  });

  it("never drops text from an element it does not recognise", () => {
    // Losing formatting is acceptable; losing a student's words is not.
    const blocks = parseSectionHtml("<article><p>Kept</p></article><mark>Also kept</mark>");
    const rendered = text(blocks);
    expect(rendered).toContain("Kept");
    expect(rendered).toContain("Also kept");
  });

  it("keeps figure alternative text rather than discarding the image silently", () => {
    const blocks = parseSectionHtml('<p>Before</p><img src="x.png" alt="Conceptual framework">');
    expect(blocks).toContainEqual({ kind: "image", alt: "Conceptual framework" });
  });

  it("survives malformed markup", () => {
    const blocks = parseSectionHtml("<p>Unclosed <strong>bold<p>Next paragraph");
    expect(text(blocks)).toContain("Unclosed");
    expect(text(blocks)).toContain("Next paragraph");
  });
});

describe("document measures", () => {
  const doc = (blocks: Block[]): ExportDocument => ({
    title: "T",
    topic: null,
    author: "A",
    institution: null,
    faculty: null,
    department: null,
    programme: null,
    frontMatter: [],
    contentsLists: [],
    degree: null,
    dateLabel: "2026",
    chapters: [{ number: "1", title: "One", blocks: [], sections: [{ number: "1.1", title: "S", blocks }] }],
    references: [],
    formatting: DEFAULT_FORMATTING,
    disclaimer: null,
  });

  it("counts tracked markers across the document", () => {
    const blocks = parseSectionHtml(
      "<p>[STUDENT DATA REQUIRED: sample size]</p><p>[STUDENT DATA REQUIRED: response rate]</p>",
    );
    expect(countPlaceholders(doc(blocks))).toBe(2);
  });

  it("counts words of prose but not markers", () => {
    const blocks = parseSectionHtml("<p>One two three</p><p>[STUDENT DATA REQUIRED: not counted]</p>");
    expect(countWords(doc(blocks))).toBe(3);
  });
});
