import { describe, expect, it } from "vitest";

import {
  assembleDocument,
  formatReference,
  parseFontSize,
  parseLineSpacing,
  parseMargins,
  type AssembleInput,
} from "@/server/services/export/assemble";
import { DEFAULT_FORMATTING } from "@/server/services/export/document";

/**
 * The formatting step stores free text, so a student writes "12pt" or "double
 * spacing" rather than a number. A misreading here does not throw — it quietly
 * produces a document laid out wrongly — so the parsing is tested against the
 * phrasings departments actually use.
 */

describe("parseFontSize", () => {
  it("reads the sizes people write", () => {
    expect(parseFontSize("12")).toBe(12);
    expect(parseFontSize("12pt")).toBe(12);
    expect(parseFontSize("12 pt")).toBe(12);
    expect(parseFontSize("size 11")).toBe(11);
    expect(parseFontSize("11.5")).toBe(11.5);
  });

  it("falls back rather than accepting an implausible size", () => {
    // "Arial 120" is a typo, not a request for a 120pt document.
    expect(parseFontSize("120")).toBe(DEFAULT_FORMATTING.fontSizePt);
    expect(parseFontSize("2")).toBe(DEFAULT_FORMATTING.fontSizePt);
    expect(parseFontSize(null)).toBe(DEFAULT_FORMATTING.fontSizePt);
    expect(parseFontSize("")).toBe(DEFAULT_FORMATTING.fontSizePt);
    expect(parseFontSize("standard")).toBe(DEFAULT_FORMATTING.fontSizePt);
  });
});

describe("parseLineSpacing", () => {
  it("understands words as well as numbers", () => {
    expect(parseLineSpacing("double")).toBe(2);
    expect(parseLineSpacing("Double spacing")).toBe(2);
    expect(parseLineSpacing("single")).toBe(1);
    expect(parseLineSpacing("one and a half")).toBe(1.5);
    expect(parseLineSpacing("1.5")).toBe(1.5);
    expect(parseLineSpacing("2.0 lines")).toBe(2);
  });

  it("prefers the word when a string contains both", () => {
    // "Double (2.0)" must not be read as 0 from some stray digit.
    expect(parseLineSpacing("Double (2.0)")).toBe(2);
  });

  it("falls back on nonsense", () => {
    expect(parseLineSpacing(null)).toBe(DEFAULT_FORMATTING.lineSpacing);
    expect(parseLineSpacing("as the department prefers")).toBe(DEFAULT_FORMATTING.lineSpacing);
    expect(parseLineSpacing("9")).toBe(DEFAULT_FORMATTING.lineSpacing);
  });
});

describe("parseMargins", () => {
  it("applies one measurement to every side", () => {
    expect(parseMargins("1 inch")).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
  });

  it("honours a wider binding margin on the left", () => {
    const margins = parseMargins("1 inch, 1.5 inch on the left");
    expect(margins.top).toBe(1);
    expect(margins.left).toBe(1.5);
  });

  it("converts centimetres instead of treating them as inches", () => {
    // 2.54cm read as 2.54in would leave almost no text on the page.
    const margins = parseMargins("2.54 cm");
    expect(margins.top).toBeCloseTo(1, 2);
    expect(margins.left).toBeCloseTo(1, 2);
  });

  it("falls back on unusable text", () => {
    expect(parseMargins(null)).toEqual(DEFAULT_FORMATTING.marginInches);
    expect(parseMargins("normal")).toEqual(DEFAULT_FORMATTING.marginInches);
    expect(parseMargins("40 inches")).toEqual(DEFAULT_FORMATTING.marginInches);
  });
});

describe("formatReference", () => {
  const base = {
    authors: [],
    year: null,
    title: "A study",
    publication: null,
    publisher: null,
    volume: null,
    issue: null,
    pages: null,
    doi: null,
    url: null,
    raw: null,
  };

  it("prefers the student's own verbatim entry", () => {
    const rendered = formatReference({ ...base, raw: "Okeke, A. (2026). Verbatim entry." });
    expect(rendered).toBe("Okeke, A. (2026). Verbatim entry.");
  });

  it("assembles structured fields when there is no raw entry", () => {
    const rendered = formatReference({
      ...base,
      authors: ["Okeke, A.", "Bello, T."],
      year: "2026",
      title: "Study habits and performance",
      publication: "Journal of Education",
      volume: "4",
      issue: "2",
      pages: "11-20",
    });

    expect(rendered).toContain("Okeke, A., Bello, T.");
    expect(rendered).toContain("(2026)");
    expect(rendered).toContain("Journal of Education");
    expect(rendered).toContain("4(2)");
    expect(rendered).toContain("11-20");
  });

  it("omits what is missing rather than inventing it", () => {
    // A fabricated citation is worse than an incomplete one.
    const rendered = formatReference({ ...base, authors: ["Okeke, A."], title: "Untitled work" });

    expect(rendered).toContain("Okeke, A.");
    expect(rendered).toContain("Untitled work");
    expect(rendered).not.toMatch(/\(\s*\)/);
    expect(rendered).not.toMatch(/undefined|null|n\.d\./i);
  });
});

describe("assembleDocument", () => {
  const input: AssembleInput = {
    project: { title: "My Project", topic: "A topic", kind: "DEMO" },
    author: "Ada Okeke",
    institution: {
      institution: "Madonna University",
      faculty: null,
      department: "Computer Science",
      programme: null,
      degree: null,
    },
    formatting: { font: "Arial", fontSize: "11pt", lineSpacing: "double", margins: "1 inch" },
    sections: [
      { id: "c2", parentId: null, number: "2", title: "Second", content: null, order: 2 },
      { id: "c1", parentId: null, number: "1", title: "First", content: "<p>Chapter prose.</p>", order: 1 },
      { id: "s12", parentId: "c1", number: "1.2", title: "Later", content: "<p>B</p>", order: 2 },
      { id: "s11", parentId: "c1", number: "1.1", title: "Earlier", content: "<p>A</p>", order: 1 },
    ],
    references: [{ ...{ authors: ["Okeke, A."], year: "2026", title: "A study", publication: null, publisher: null, volume: null, issue: null, pages: null, doi: null, url: null, raw: null } }],
    dateLabel: "August 2026",
    withDisclaimer: true,
  };

  it("rebuilds the chapter tree in order", () => {
    const doc = assembleDocument(input);

    expect(doc.chapters.map((c) => c.number)).toEqual(["1", "2"]);
    // `order` is scoped to a parent, so sections sort within their chapter.
    expect(doc.chapters[0]!.sections.map((s) => s.number)).toEqual(["1.1", "1.2"]);
    expect(doc.chapters[0]!.blocks.length).toBeGreaterThan(0);
  });

  it("carries parsed formatting through", () => {
    const doc = assembleDocument(input);
    expect(doc.formatting).toEqual({
      font: "Arial",
      fontSizePt: 11,
      lineSpacing: 2,
      marginInches: { top: 1, right: 1, bottom: 1, left: 1 },
    });
  });

  it("takes the disclaimer from the policy, not from the project kind", () => {
    // A DEMO project exported by an admin is deliberately clean, so `kind`
    // alone must never decide this.
    expect(assembleDocument({ ...input, withDisclaimer: true }).disclaimer).not.toBeNull();
    expect(assembleDocument({ ...input, withDisclaimer: false }).disclaimer).toBeNull();

    const realProject: AssembleInput = {
      ...input,
      project: { ...input.project, kind: "REAL" },
      withDisclaimer: true,
    };
    expect(assembleDocument(realProject).disclaimer).not.toBeNull();
  });
});
