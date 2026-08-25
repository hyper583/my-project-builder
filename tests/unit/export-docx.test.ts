import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

import { renderDocx } from "@/server/services/export/docx";
import {
  DEFAULT_FORMATTING,
  DEMO_DISCLAIMER,
  parseSectionHtml,
  type ExportDocument,
} from "@/server/services/export/document";

/**
 * These assertions read the generated file rather than trusting the renderer's
 * own report. `disclaimerRendered` is what `assertDisclaimer` gates on, so a
 * test that only checked the flag would pass for a renderer that set it and
 * drew nothing — precisely the failure the policy exists to catch.
 */

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
            title: "Background to the Study",
            blocks: parseSectionHtml(
              "<p>Social media has become a routine part of undergraduate life.</p>" +
                "<p>Respondents reported [STUDENT DATA REQUIRED: mean daily usage] on average.</p>" +
                "<ul><li>First point</li><li>Second point</li></ul>" +
                "<table><tr><th>Variable</th><th>Measure</th></tr><tr><td>Usage</td><td>Hours</td></tr></table>",
            ),
          },
        ],
      },
    ],
    references: ["Okeke, A. (2026). A study of study habits. Journal of Things, 4(2), 11–20."],
    formatting: DEFAULT_FORMATTING,
    disclaimer: null,
    ...overrides,
  };
}

/** A .docx is a zip; this reads the parts we need to assert on. */
function readDocxParts(bytes: Uint8Array): Record<string, string> {
  const files = unzipSync(bytes);
  const parts: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith(".xml")) parts[name] = strFromU8(content);
  }
  return parts;
}

describe("renderDocx", () => {
  it("produces a valid docx package with the expected parts", async () => {
    const result = await renderDocx(baseDocument());

    expect(result.extension).toBe("docx");
    expect(result.contentType).toContain("wordprocessingml");
    expect(result.bytes.byteLength).toBeGreaterThan(1000);

    // PK zip signature.
    expect(result.bytes[0]).toBe(0x50);
    expect(result.bytes[1]).toBe(0x4b);

    const parts = readDocxParts(result.bytes);
    expect(Object.keys(parts)).toContain("word/document.xml");
  });

  it("carries the student's content, including tables and lists", async () => {
    const result = await renderDocx(baseDocument());
    const body = readDocxParts(result.bytes)["word/document.xml"]!;

    expect(body).toContain("Social media has become a routine part");
    expect(body).toContain("First point");
    expect(body).toContain("Hours");
    expect(body).toContain("Journal of Things");
    // The title page renders the institution in caps, as academic title pages do.
    expect(body).toContain("MADONNA UNIVERSITY");
  });

  it("keeps a tracked marker visible rather than dropping it", async () => {
    const result = await renderDocx(baseDocument());
    const body = readDocxParts(result.bytes)["word/document.xml"]!;

    // The marker must survive into the submitted document, so a supervisor
    // sees exactly where real data is still missing.
    expect(body).toContain("YOUR DATA REQUIRED");
    expect(body).toContain("mean daily usage");
  });

  it("reports no disclaimer, and writes none, for a real project", async () => {
    const result = await renderDocx(baseDocument({ disclaimer: null }));
    const parts = readDocxParts(result.bytes);
    const all = Object.values(parts).join("");

    expect(result.disclaimerRendered).toBe(false);
    expect(all).not.toContain("SAMPLE PROJECT");
    expect(all).not.toContain("not real research");
  });

  it("writes all three markings for a demo, and reports it", async () => {
    const result = await renderDocx(baseDocument({ disclaimer: DEMO_DISCLAIMER }));
    const parts = readDocxParts(result.bytes);

    expect(result.disclaimerRendered).toBe(true);

    // 1. Title-page block.
    const body = parts["word/document.xml"]!;
    expect(body).toContain("SAMPLE PROJECT");
    expect(body).toContain("must not be submitted as academic work");

    // 2. Running footer, in a footer part rather than the body.
    const footer = Object.entries(parts).find(([name]) => name.includes("footer"));
    expect(footer, "no footer part was written").toBeDefined();
    expect(footer![1]).toContain("illustrative content, not real research");

    // 3. Watermark, in a header part, drawn as a rotated VML shape so it sits
    // behind the text rather than in the flow.
    const header = Object.entries(parts).find(([name]) => name.includes("header"));
    expect(header, "no header part was written").toBeDefined();
    expect(header![1]).toContain("SAMPLE");
    expect(header![1]).toMatch(/rotation:\s*-?45/);
  });

  it("applies the student's formatting choices", async () => {
    const result = await renderDocx(
      baseDocument({
        formatting: {
          font: "Arial",
          fontSizePt: 11,
          lineSpacing: 1.5,
          marginInches: { top: 1, right: 1, bottom: 1, left: 1.25 },
        },
      }),
    );
    const body = readDocxParts(result.bytes)["word/document.xml"]!;

    expect(body).toContain("Arial");
    // 11pt is 22 half-points; 1.5 spacing is 360 twips; 1.25in is 1800 twips.
    expect(body).toContain('w:sz w:val="22"');
    expect(body).toContain('w:line="360"');
    expect(body).toContain('w:left="1800"');
  });

  it("includes a table of contents", async () => {
    const result = await renderDocx(baseDocument());
    const body = readDocxParts(result.bytes)["word/document.xml"]!;
    expect(body).toContain("TOC");
    expect(body).toContain("TABLE OF CONTENTS");
  });

  it("handles an empty project without throwing", async () => {
    const result = await renderDocx(
      baseDocument({ chapters: [], references: [], topic: null, institution: null }),
    );
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });
});

describe("front matter", () => {
  /*
   * The pages a project must open with. The export produced none of them, so a
   * student who paid for consistent formatting still built Certification,
   * Declaration and the Abstract by hand in Word — which is where the
   * formatting stops matching the rest of the document.
   */
  const withFrontMatter = () =>
    baseDocument({
      frontMatter: [
        { heading: "DECLARATION", blocks: [{ kind: "paragraph", runs: [{ kind: "text", text: "I, ADA OKEKE, declare" }] }] },
        { heading: "ABSTRACT", blocks: [{ kind: "paragraph", runs: [{ kind: "text", text: "This study examines" }] }] },
      ],
      contentsLists: [
        { heading: "LIST OF TABLES", blocks: [{ kind: "paragraph", runs: [{ kind: "text", text: "Table 4.1: Response Rate" }] }] },
      ],
    });

  it("writes every page into the document", async () => {
    const body = readDocxParts((await renderDocx(withFrontMatter())).bytes)["word/document.xml"]!;

    expect(body).toContain("DECLARATION");
    expect(body).toContain("I, ADA OKEKE, declare");
    expect(body).toContain("ABSTRACT");
    expect(body).toContain("LIST OF TABLES");
    expect(body).toContain("Table 4.1: Response Rate");
  });

  it("puts the front pages before the contents and the lists after it", async () => {
    // Order is the whole convention. A List of Tables ahead of the Table of
    // Contents is wrong in a way a supervisor notices immediately.
    const body = readDocxParts((await renderDocx(withFrontMatter())).bytes)["word/document.xml"]!;

    expect(body.indexOf("DECLARATION")).toBeLessThan(body.indexOf("TABLE OF CONTENTS"));
    expect(body.indexOf("ABSTRACT")).toBeLessThan(body.indexOf("TABLE OF CONTENTS"));
    expect(body.indexOf("TABLE OF CONTENTS")).toBeLessThan(body.indexOf("LIST OF TABLES"));
  });

  it("still marks a demo export with front matter present", async () => {
    /*
     * `assertDisclaimer` gates on what the renderer reports drawing, and the
     * front pages are inserted ahead of everything. A page added before the
     * title block is exactly how that marking could be lost.
     */
    const result = await renderDocx({ ...withFrontMatter(), disclaimer: DEMO_DISCLAIMER });

    expect(result.disclaimerRendered).toBe(true);
    const body = readDocxParts(result.bytes)["word/document.xml"]!;
    expect(body).toContain(DEMO_DISCLAIMER.titleBlock);
  });

  it("captions a table with the label the list carries", async () => {
    const doc = baseDocument({
      chapters: [
        {
          number: "4",
          title: "Findings",
          blocks: [],
          sections: [
            {
              number: "4.1",
              title: "Response Rate",
              blocks: [
                {
                  kind: "table",
                  label: "Table 4.1: Response Rate",
                  rows: [{ header: true, cells: [[{ kind: "text", text: "Level" }]] }],
                },
              ],
            },
          ],
        },
      ],
    });

    const body = readDocxParts((await renderDocx(doc)).bytes)["word/document.xml"]!;

    expect(body).toContain("Table 4.1: Response Rate");
  });
});
