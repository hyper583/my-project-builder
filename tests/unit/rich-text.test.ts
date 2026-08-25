import { describe, expect, it } from "vitest";

import { plainTextToHtml } from "@/lib/rich-text";

/**
 * What "Replace selection" puts into the document.
 *
 * These exist because of a measured failure, not a hypothetical one. Running
 * "Expand" on one paragraph returned five; accepting it produced a single
 * 2,400-character paragraph holding eight literal newlines, which HTML renders
 * as nothing. The student read a structured suggestion and received a wall of
 * text — and would have exported it to Word that way.
 */

describe("structure the student can see", () => {
  it("makes a paragraph per blank line, which is what was being lost", () => {
    const html = plainTextToHtml("First paragraph.\n\nSecond paragraph.\n\nThird.");

    expect(html).toBe("<p>First paragraph.</p><p>Second paragraph.</p><p>Third.</p>");
  });

  it("keeps a single newline as a line break rather than dropping it", () => {
    // It looked like a break in the answer they just read, so it has to be one
    // in the document. Silently joining the lines changes the meaning of an
    // address, a list of objectives, or a set of hypotheses.
    expect(plainTextToHtml("Line one\nLine two")).toBe("<p>Line one<br>Line two</p>");
  });

  it("tolerates the whitespace models actually emit between paragraphs", () => {
    expect(plainTextToHtml("One.\n   \nTwo.")).toBe("<p>One.</p><p>Two.</p>");
    expect(plainTextToHtml("One.\r\n\r\nTwo.")).toBe("<p>One.</p><p>Two.</p>");
    expect(plainTextToHtml("One.\n\n\n\nTwo.")).toBe("<p>One.</p><p>Two.</p>");
  });

  it("wraps a single paragraph rather than passing it through bare", () => {
    // Bare text is what `insertContent` mishandled in the first place.
    expect(plainTextToHtml("Just one paragraph.")).toBe("<p>Just one paragraph.</p>");
  });

  it("returns nothing for nothing, so the caller can decline to insert", () => {
    expect(plainTextToHtml("")).toBe("");
    expect(plainTextToHtml("   \n\n  ")).toBe("");
  });
});

describe("text that would otherwise be parsed as markup", () => {
  it("keeps a mathematical comparison intact", () => {
    /*
     * The case that makes escaping mandatory. Unescaped, "p < 0.05" opens a
     * tag named "0.05," and the rest of the sentence disappears into it — in a
     * product whose Chapter Four is full of exactly this notation.
     */
    const html = plainTextToHtml("The correlation was significant at p < 0.05, so H01 was rejected.");

    expect(html).toContain("p &lt; 0.05");
    expect(html).toContain("H01 was rejected.");
  });

  it("escapes ampersands and closing angle brackets too", () => {
    const html = plainTextToHtml("Research & Development, x > y");

    expect(html).toContain("Research &amp; Development");
    expect(html).toContain("x &gt; y");
  });

  it("does not let text introduce elements of its own", () => {
    const html = plainTextToHtml("An example: <script>alert(1)</script>");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("leaves a student-data placeholder exactly as written", () => {
    // The placeholder scanner reads the saved text, so mangling these would
    // lose the count of what still needs the student's own figures.
    const html = plainTextToHtml("Usage was high.\n\n[STUDENT DATA REQUIRED: response rate]");

    expect(html).toContain("[STUDENT DATA REQUIRED: response rate]");
  });
});
