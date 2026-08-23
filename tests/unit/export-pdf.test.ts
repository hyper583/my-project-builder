import { describe, expect, it } from "vitest";

import { renderPdf } from "@/server/services/export/pdf";
import { computeBudget, distribute } from "@/server/services/generation/budget";
import { FIVE_CHAPTER_TEMPLATE } from "@/lib/structures";
import {
  DEFAULT_FORMATTING,
  DEMO_DISCLAIMER,
  parseSectionHtml,
  type ExportDocument,
} from "@/server/services/export/document";

/**
 * As with the DOCX tests, these read the produced file rather than trusting
 * `disclaimerRendered`. A renderer that set the flag and drew nothing would
 * pass a test that only checked the flag, and that is exactly the failure the
 * export policy exists to prevent.
 *
 * PDF text is stored in content streams that may be Flate-compressed, so the
 * assertions extract text with pdf.js rather than scanning the raw bytes.
 */

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  let all = "";
  for (let page = 1; page <= doc.numPages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent();
    all += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  await doc.destroy();
  return all;
}

function baseDocument(overrides: Partial<ExportDocument> = {}): ExportDocument {
  return {
    title: "Social Media Use and Academic Performance",
    topic: "The effect of social media usage on undergraduates",
    author: "Ada Okeke",
    institution: "Madonna University",
    faculty: "Faculty of Natural and Applied Sciences",
    department: "Computer Science",
    programme: "B.Sc. Computer Science",
    degree: "Bachelor of Science",
    dateLabel: "August 2026",
    chapters: [
      {
        number: "1",
        title: "Introduction",
        blocks: [],
        sections: [
          {
            number: "1.1",
            title: "Background to the Study",
            blocks: parseSectionHtml(
              "<p>Social media has become a routine part of undergraduate life.</p>" +
                "<p>Respondents reported [STUDENT DATA REQUIRED: mean daily usage] on average.</p>" +
                "<ul><li>First listed point</li></ul>" +
                "<table><tr><th>Variable</th><th>Measure</th></tr><tr><td>Usage</td><td>Hours</td></tr></table>",
            ),
          },
        ],
      },
    ],
    references: ["Okeke, A. (2026). A study of study habits. Journal of Things, 4(2), 11-20."],
    formatting: DEFAULT_FORMATTING,
    disclaimer: null,
    ...overrides,
  };
}

describe("renderPdf", () => {
  it("produces a valid PDF", async () => {
    const result = await renderPdf(baseDocument());

    expect(result.extension).toBe("pdf");
    expect(result.contentType).toBe("application/pdf");
    expect(result.bytes.byteLength).toBeGreaterThan(1000);

    // %PDF header.
    expect(String.fromCharCode(...result.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("carries the student's content", async () => {
    const text = await pdfText((await renderPdf(baseDocument())).bytes);

    expect(text).toContain("Social media has become a routine part");
    expect(text).toContain("First listed point");
    expect(text).toContain("Hours");
    expect(text).toContain("Journal of Things");
    expect(text).toContain("MADONNA UNIVERSITY");
  });

  it("keeps a tracked marker visible", async () => {
    const text = await pdfText((await renderPdf(baseDocument())).bytes);
    expect(text).toContain("YOUR DATA REQUIRED");
    expect(text).toContain("mean daily usage");
  });

  it("writes no disclaimer for a real project", async () => {
    const result = await renderPdf(baseDocument({ disclaimer: null }));
    const text = await pdfText(result.bytes);

    expect(result.disclaimerRendered).toBe(false);
    expect(text).not.toContain("SAMPLE");
    expect(text).not.toContain("not real research");
  });

  it("marks a demo on the title page and on every page", async () => {
    const result = await renderPdf(baseDocument({ disclaimer: DEMO_DISCLAIMER }));
    expect(result.disclaimerRendered).toBe(true);

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: result.bytes,
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;

    expect(doc.numPages).toBeGreaterThan(1);

    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p += 1) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
    }
    await doc.destroy();

    // Title block, on the first page only.
    expect(pages[0]).toContain("must not be submitted as academic work");

    // Running footer and watermark on EVERY page — the point of `fixed`.
    for (const [index, page] of pages.entries()) {
      expect(page, `page ${index + 1} is missing the running footer`).toContain(
        "illustrative content, not real research",
      );
      expect(page, `page ${index + 1} is missing the watermark`).toContain("SAMPLE");
    }
  });

  it("maps a requested font onto a standard PDF face rather than silently defaulting", async () => {
    // Nothing is embedded, so Arial must land on Helvetica and Times New Roman
    // on Times-Roman — metrically equivalent, not an arbitrary substitution.
    const arial = await renderPdf(
      baseDocument({ formatting: { ...DEFAULT_FORMATTING, font: "Arial" } }),
    );
    const times = await renderPdf(
      baseDocument({ formatting: { ...DEFAULT_FORMATTING, font: "Times New Roman" } }),
    );

    const asString = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");
    expect(asString(arial.bytes)).toContain("Helvetica");
    expect(asString(times.bytes)).toContain("Times");
  });

  it("handles an empty project without throwing", async () => {
    const result = await renderPdf(
      baseDocument({ chapters: [], references: [], topic: null, institution: null }),
    );
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  /**
   * A real chapter runs to twenty pages or more; every other test here renders
   * a single short section, which is precisely why this shipped broken.
   *
   * The page furniture is `fixed`, so react-pdf re-resolves its style on every
   * rendered page and mutates the shared style object in place. An inherited
   * `lineHeight` therefore compounded by the font size once per page, and
   * overflowed into an unrepresentable number once a single chapter spilled
   * past roughly a dozen pages. A literature review always does, so every real
   * export failed while the short sample project passed.
   */
  it("renders a chapter long enough to span many pages", async () => {
    const paragraph =
      "<p>" +
      "Financial inclusion has emerged as a central concern of development economics. ".repeat(12) +
      "</p>";

    const chapters = Array.from({ length: 5 }, (_, chapter) => ({
      number: String(chapter + 1),
      title: `Chapter ${chapter + 1}`,
      blocks: [],
      sections: Array.from({ length: 5 }, (_, section) => ({
        number: `${chapter + 1}.${section + 1}`,
        title: `Section ${chapter + 1}.${section + 1}`,
        blocks: parseSectionHtml(paragraph.repeat(6)),
      })),
    }));

    const result = await renderPdf(baseDocument({ chapters }));
    expect(result.bytes.byteLength).toBeGreaterThan(10_000);

    const text = await pdfText(result.bytes);
    expect(text).toContain("Section 5.5");
  });
});

/**
 * The page estimate, checked against the renderer that decides the truth.
 *
 * `budget.ts` converts a page target into a word budget, and nothing verified
 * that the words it asked for actually filled the pages it promised. They did
 * not: the conversion assumed an unbroken column of text and ran about 40%
 * optimistic, so the first real project — asked for 60 to 80 pages — rendered
 * to 99. This is the check that would have caught it.
 */
describe("the page estimate against the real renderer", () => {
  const WORDS = "Financial inclusion has emerged as a central concern of development economics".split(" ");
  const prose = (words: number) =>
    "<p>" +
    Array.from({ length: words }, (_, i) => WORDS[i % WORDS.length]).join(" ") +
    ".</p>";

  it("renders a document inside the page range it was budgeted for", async () => {
    const formatting = DEFAULT_FORMATTING;
    const flat = FIVE_CHAPTER_TEMPLATE.flatMap((chapter) =>
      chapter.children.map((child) => ({ title: child.title, chapterTitle: chapter.title })),
    );

    const budget = computeBudget({ minPages: 60, maxPages: 80 }, formatting, flat.length);
    expect(budget).not.toBeNull();
    const perSection = distribute(budget!, flat);

    let n = 0;
    const chapters = FIVE_CHAPTER_TEMPLATE.map((chapter) => ({
      number: chapter.number,
      title: chapter.title,
      blocks: [],
      sections: chapter.children.map((child) => ({
        number: child.number,
        title: child.title,
        // Every real project carries these, and they are not free: each renders
        // as a padded block several lines tall. A test document of pure prose
        // packs tighter than anything a student will ever export.
        blocks: parseSectionHtml(
          prose(perSection[n++]!) +
            "<p>Respondents reported [STUDENT DATA REQUIRED: mean value] on average.</p>".repeat(2),
        ),
      })),
    }));

    const result = await renderPdf(baseDocument({ chapters, formatting }));

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: result.bytes,
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;
    const rendered = doc.numPages;
    await doc.destroy();

    // The requested range, with no slack. The budget accounts for front
    // matter, contents, headings, chapter breaks and the reference list, so
    // there is nothing left for the bounds to absorb. Before that accounting
    // this document rendered to 98 pages.
    expect(rendered).toBeGreaterThanOrEqual(60);
    expect(rendered).toBeLessThanOrEqual(80);
  });
});
