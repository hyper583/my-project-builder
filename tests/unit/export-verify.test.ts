import { describe, expect, it } from "vitest";

import { renderDocx } from "@/server/services/export/docx";
import { renderPdf } from "@/server/services/export/pdf";
import { verifyDisclaimer } from "@/server/services/export/verify";
import {
  DEFAULT_FORMATTING,
  DEMO_DISCLAIMER,
  parseSectionHtml,
  type ExportDocument,
  type RenderResult,
} from "@/server/services/export/document";

/**
 * The verifier is the last line before a fabricated academic document reaches
 * a student, so these tests check that it actually looks at the bytes: it must
 * pass a marked file, fail an unmarked one, and — the case that matters — fail
 * a file whose renderer wrongly claimed to have marked it.
 */

function document(overrides: Partial<ExportDocument> = {}): ExportDocument {
  return {
    title: "Social Media Use and Academic Performance",
    topic: null,
    author: "Ada Okeke",
    institution: "Madonna University",
    faculty: null,
    department: "Computer Science",
    programme: null,
    degree: null,
    dateLabel: "August 2026",
    // A project with nothing filled in yet: the front pages are omitted
    // rather than printed empty. Tests that need them override these.
    frontMatter: [],
    contentsLists: [],
    chapters: [
      {
        number: "1",
        title: "Introduction",
        blocks: [],
        sections: [
          {
            number: "1.1",
            title: "Background",
            blocks: parseSectionHtml("<p>Some body text for the document.</p>"),
          },
        ],
      },
    ],
    references: [],
    formatting: DEFAULT_FORMATTING,
    disclaimer: null,
    ...overrides,
  };
}

describe("verifyDisclaimer", () => {
  it("passes a real project, which is not supposed to carry one", async () => {
    const result = await renderDocx(document());
    expect(await verifyDisclaimer(result, null)).toEqual({ present: true, missing: [] });
  });

  it("finds all three markings in a demo DOCX", async () => {
    const result = await renderDocx(document({ disclaimer: DEMO_DISCLAIMER }));
    expect(await verifyDisclaimer(result, DEMO_DISCLAIMER)).toEqual({ present: true, missing: [] });
  });

  it("finds all three markings in a demo PDF", async () => {
    // react-pdf embeds subset fonts and writes text as hex glyph indices, so
    // there are no readable strings in the bytes at all. This passes only if
    // the verifier really extracts text through the font's ToUnicode map.
    const result = await renderPdf(document({ disclaimer: DEMO_DISCLAIMER }));
    expect(await verifyDisclaimer(result, DEMO_DISCLAIMER)).toEqual({ present: true, missing: [] });
  });

  it("fails an unmarked file even when the renderer claims it is marked", async () => {
    // The whole point. A renderer that sets the flag and draws nothing must
    // not be able to release a clean fabricated document.
    const unmarkedDocx = await renderDocx(document({ disclaimer: null }));
    const lying: RenderResult = { ...unmarkedDocx, disclaimerRendered: true };

    const verdict = await verifyDisclaimer(lying, DEMO_DISCLAIMER);
    expect(verdict.present).toBe(false);
    expect(verdict.missing.length).toBeGreaterThan(0);
  });

  it("fails an unmarked PDF that claims to be marked", async () => {
    const unmarkedPdf = await renderPdf(document({ disclaimer: null }));
    const lying: RenderResult = { ...unmarkedPdf, disclaimerRendered: true };

    expect((await verifyDisclaimer(lying, DEMO_DISCLAIMER)).present).toBe(false);
  });

  it("names what is missing so a failure can be diagnosed", async () => {
    const unmarked = await renderDocx(document({ disclaimer: null }));
    const verdict = await verifyDisclaimer({ ...unmarked, disclaimerRendered: true }, DEMO_DISCLAIMER);

    // All three markings are absent from an unmarked file.
    expect(verdict.missing).toHaveLength(3);
  });

  it("treats unreadable output as unmarked rather than throwing", async () => {
    const rubbish: RenderResult = {
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
      disclaimerRendered: true,
    };

    const verdict = await verifyDisclaimer(rubbish, DEMO_DISCLAIMER);
    expect(verdict.present).toBe(false);
  });
});
