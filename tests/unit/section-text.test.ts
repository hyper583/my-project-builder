import { describe, expect, it } from "vitest";

import { SECTION_CONTEXT_LIMIT, sectionPlainText } from "@/server/services/ai/section-text";

/**
 * The section text the assistant is given.
 *
 * Written after watching the assistant answer "I can't see the text of 1.1 from
 * here — paste it in" to a student who was looking straight at 1.1. The route
 * had been sending the section's number and title and nothing else.
 */

describe("turning stored editor HTML into readable prose", () => {
  it("keeps paragraphs apart", () => {
    // Taking `textContent` off the tree runs them together, and the model is
    // then asked to comment on the structure of a single wall of text.
    const text = sectionPlainText("<p>First paragraph.</p><p>Second paragraph.</p>");

    expect(text).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("keeps list items on their own lines", () => {
    const text = sectionPlainText("<ul><li>Objective one</li><li>Objective two</li></ul>");

    expect(text).toContain("Objective one\nObjective two");
  });

  it("keeps headings off the paragraph that follows them", () => {
    const text = sectionPlainText("<h2>Research Design</h2><p>This study adopts a survey.</p>");

    expect(text).toBe("Research Design\n\nThis study adopts a survey.");
  });

  it("turns a line break into a line break", () => {
    expect(sectionPlainText("<p>Line one<br>Line two</p>")).toBe("Line one\nLine two");
  });

  it("carries no markup through to the prompt", () => {
    const text = sectionPlainText('<p>See <a href="https://example.test">this source</a>.</p>');

    expect(text).toBe("See this source.");
    expect(text).not.toContain("<");
  });

  it("preserves placeholders, which are the point of half the questions asked", () => {
    const text = sectionPlainText("<p>[STUDENT DATA REQUIRED: response rate]</p>");

    expect(text).toBe("[STUDENT DATA REQUIRED: response rate]");
  });
});

describe("sections with nothing in them", () => {
  it("returns null rather than an empty string", () => {
    // The caller branches on this to say "still empty" instead of sending a
    // blank block that reads as though the section had been checked and found
    // to contain nothing.
    expect(sectionPlainText(null)).toBeNull();
    expect(sectionPlainText("")).toBeNull();
    expect(sectionPlainText("   ")).toBeNull();
    expect(sectionPlainText("<p></p>")).toBeNull();
  });
});

describe("bounding what is sent", () => {
  it("truncates a very long section and says that it did", () => {
    const long = `<p>${"word ".repeat(4000)}</p>`;

    const text = sectionPlainText(long)!;

    expect(text.length).toBeLessThan(SECTION_CONTEXT_LIMIT + 60);
    // Marked, so the model knows the argument continues rather than assuming
    // the section simply stops mid-sentence.
    expect(text).toContain("section continues");
  });

  it("leaves a section that fits entirely alone", () => {
    const text = sectionPlainText("<p>Short enough.</p>")!;

    expect(text).toBe("Short enough.");
    expect(text).not.toContain("section continues");
  });
});
