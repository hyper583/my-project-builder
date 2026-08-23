import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TableOfContents,
  TextRun,
  Textbox,
  WidthType,
} from "docx";

import type {
  Block,
  ExportDocument,
  Inline,
  RenderResult,
} from "@/server/services/export/document";

/**
 * DOCX renderer.
 *
 * Reads only the canonical document — never the database — so what it produces
 * is a pure function of what the caller assembled. It reports back whether it
 * actually drew the disclaimer, and the caller asserts on that: a renderer
 * that skipped the marking must fail the export rather than return a clean
 * file.
 */

/** Word measures in half-points, twips (1/1440 inch) and eighths of a point. */
const halfPoints = (pt: number) => Math.round(pt * 2);
const twips = (inches: number) => Math.round(inches * 1440);
/** Word's line spacing is 240 twips per single line. */
const lineSpacing = (multiple: number) => Math.round(multiple * 240);

const PLACEHOLDER_SHADING = "FFF4E5";
const PLACEHOLDER_TEXT = "8A5A00";

function runs(inlines: Inline[], base: { font: string; size: number }): (TextRun | ExternalHyperlink)[] {
  return inlines.map((inline) => {
    if (inline.kind === "link") {
      return new ExternalHyperlink({
        link: inline.href,
        children: [
          new TextRun({
            text: inline.text,
            font: base.font,
            size: base.size,
            style: "Hyperlink",
          }),
        ],
      });
    }
    return new TextRun({
      text: inline.text,
      font: base.font,
      size: base.size,
      bold: inline.bold,
      italics: inline.italic,
      strike: inline.strike,
    });
  });
}

function renderBlocks(blocks: Block[], doc: ExportDocument): (Paragraph | Table)[] {
  const base = { font: doc.formatting.font, size: halfPoints(doc.formatting.fontSizePt) };
  const spacing = { line: lineSpacing(doc.formatting.lineSpacing), after: 120 };
  const out: (Paragraph | Table)[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case "paragraph":
        out.push(new Paragraph({ children: runs(block.runs, base), spacing }));
        break;

      case "heading":
        out.push(
          new Paragraph({
            children: runs(block.runs, { ...base, size: halfPoints(doc.formatting.fontSizePt + 1) }),
            heading: block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            spacing: { before: 240, after: 120 },
          }),
        );
        break;

      case "list":
        for (const item of block.items) {
          out.push(
            new Paragraph({
              children: runs(item, base),
              numbering: block.ordered
                ? { reference: "ordered-list", level: 0 }
                : { reference: "bullet-list", level: 0 },
              spacing,
            }),
          );
        }
        break;

      case "table":
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: block.rows.map(
              (row) =>
                new TableRow({
                  tableHeader: row.header,
                  children: row.cells.map(
                    (cell) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: runs(
                              row.header
                                ? cell.map((c) => ({ ...c, bold: true }) as Inline)
                                : cell,
                              base,
                            ),
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          }),
        );
        // Word merges consecutive tables without a paragraph between them.
        out.push(new Paragraph({ text: "", spacing: { after: 120 } }));
        break;

      case "placeholder":
        // Shaded and labelled, so a marker is impossible to mistake for prose
        // that has already been written.
        out.push(
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: PLACEHOLDER_SHADING },
            spacing: { before: 120, after: 120 },
            children: [
              new TextRun({
                text: `[YOUR DATA REQUIRED: ${block.label}]`,
                font: base.font,
                size: base.size,
                bold: true,
                color: PLACEHOLDER_TEXT,
              }),
            ],
          }),
        );
        break;

      case "image":
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing,
            children: [
              new TextRun({
                text: `[Figure: ${block.alt}]`,
                font: base.font,
                size: base.size,
                italics: true,
              }),
            ],
          }),
        );
        break;
    }
  }

  return out;
}

/**
 * A true rotated watermark.
 *
 * Drawn as a VML textbox in the page header, which is where Word puts a real
 * watermark: it sits behind the body on every page and is not part of the text
 * flow. A large grey paragraph in the body would flow with the text and could
 * be deleted with a single selection.
 */
function watermarkBox(word: string): Textbox {
  return new Textbox({
    style: {
      position: "absolute",
      width: "480pt",
      height: "240pt",
      rotation: -45,
      positionHorizontal: "center",
      positionHorizontalRelative: "margin",
      positionVertical: "center",
      positionVerticalRelative: "margin",
      wrapStyle: "none",
    },
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: word, size: halfPoints(90), bold: true, color: "D9D9D9" }),
    ],
  });
}

/** Renders the document to a .docx file. */
export async function renderDocx(doc: ExportDocument): Promise<RenderResult> {
  const base = { font: doc.formatting.font, size: halfPoints(doc.formatting.fontSizePt) };
  const wants = doc.disclaimer;

  // Each part is recorded as it is added, so the flag reports what was drawn
  // rather than what was intended.
  let drewTitleBlock = false;
  let drewFooter = false;
  let drewWatermark = false;

  const titlePage: Paragraph[] = [];

  const centered = (text: string, opts: { bold?: boolean; size?: number; before?: number } = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: opts.before ?? 0, after: 120 },
      children: [
        new TextRun({
          text,
          font: base.font,
          size: opts.size ?? base.size,
          bold: opts.bold,
        }),
      ],
    });

  if (doc.institution) titlePage.push(centered(doc.institution.toUpperCase(), { bold: true }));
  if (doc.faculty) titlePage.push(centered(doc.faculty));
  if (doc.department) titlePage.push(centered(doc.department));

  titlePage.push(
    centered(doc.title.toUpperCase(), {
      bold: true,
      size: halfPoints(doc.formatting.fontSizePt + 4),
      before: 720,
    }),
  );
  if (doc.topic && doc.topic !== doc.title) titlePage.push(centered(doc.topic));

  titlePage.push(centered(`BY`, { before: 480 }));
  titlePage.push(centered(doc.author.toUpperCase(), { bold: true }));
  if (doc.programme) titlePage.push(centered(doc.programme, { before: 240 }));
  if (doc.degree) titlePage.push(centered(doc.degree));
  titlePage.push(centered(doc.dateLabel, { before: 240 }));

  if (wants) {
    titlePage.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 120 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 12, color: "B42318" },
          bottom: { style: BorderStyle.SINGLE, size: 12, color: "B42318" },
          left: { style: BorderStyle.SINGLE, size: 12, color: "B42318" },
          right: { style: BorderStyle.SINGLE, size: 12, color: "B42318" },
        },
        shading: { type: ShadingType.CLEAR, fill: "FDECEB" },
        children: [
          new TextRun({
            text: wants.titleBlock,
            font: base.font,
            size: halfPoints(doc.formatting.fontSizePt - 1),
            bold: true,
            color: "B42318",
          }),
        ],
      }),
    );
    drewTitleBlock = true;
  }

  titlePage.push(new Paragraph({ children: [new PageBreak()] }));

  const body: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: "TABLE OF CONTENTS", font: base.font, size: base.size, bold: true }),
      ],
    }),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  for (const chapter of doc.chapters) {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [
          new TextRun({
            text: [chapter.number ? `CHAPTER ${chapter.number}` : null, chapter.title.toUpperCase()]
              .filter(Boolean)
              .join(" — "),
            font: base.font,
            size: halfPoints(doc.formatting.fontSizePt + 2),
            bold: true,
          }),
        ],
      }),
    );
    body.push(...renderBlocks(chapter.blocks, doc));

    for (const section of chapter.sections) {
      body.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: [section.number, section.title].filter(Boolean).join(" "),
              font: base.font,
              size: halfPoints(doc.formatting.fontSizePt + 1),
              bold: true,
            }),
          ],
        }),
      );
      body.push(...renderBlocks(section.blocks, doc));
    }

    body.push(new Paragraph({ children: [new PageBreak()] }));
  }

  if (doc.references.length > 0) {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [
          new TextRun({
            text: "REFERENCES",
            font: base.font,
            size: halfPoints(doc.formatting.fontSizePt + 2),
            bold: true,
          }),
        ],
      }),
    );
    for (const reference of doc.references) {
      body.push(
        new Paragraph({
          // Hanging indent, as every citation style requires.
          indent: { left: twips(0.5), hanging: twips(0.5) },
          spacing: { line: lineSpacing(doc.formatting.lineSpacing), after: 120 },
          children: [new TextRun({ text: reference, font: base.font, size: base.size })],
        }),
      );
    }
  }

  const footerChildren: Paragraph[] = [];
  if (wants) {
    footerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: wants.runningFooter,
            font: base.font,
            size: halfPoints(9),
            bold: true,
            color: "B42318",
          }),
        ],
      }),
    );
    drewFooter = true;
  }
  footerChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ children: [PageNumber.CURRENT], font: base.font, size: halfPoints(10) }),
      ],
    }),
  );

  const headers = wants
    ? { default: new Header({ children: [watermarkBox(wants.watermark)] }) }
    : undefined;
  if (wants) drewWatermark = true;

  const document = new Document({
    creator: doc.author,
    title: doc.title,
    description: doc.topic ?? undefined,
    numbering: {
      config: [
        {
          reference: "bullet-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: twips(0.5), hanging: twips(0.25) } } },
            },
          ],
        },
        {
          reference: "ordered-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: twips(0.5), hanging: twips(0.25) } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: twips(doc.formatting.marginInches.top),
              right: twips(doc.formatting.marginInches.right),
              bottom: twips(doc.formatting.marginInches.bottom),
              left: twips(doc.formatting.marginInches.left),
            },
          },
        },
        headers,
        footers: { default: new Footer({ children: footerChildren }) },
        children: [...titlePage, ...body],
      },
    ],
  });

  const bytes = await Packer.toBuffer(document);

  return {
    bytes: new Uint8Array(bytes),
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    // All three markings, or none. A partially marked demo export is a failure.
    disclaimerRendered: drewTitleBlock && drewFooter && drewWatermark,
  };
}
