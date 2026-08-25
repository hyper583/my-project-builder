import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type {
  Block,
  ExportDocument,
  ExportFormatting,
  Inline,
  RenderResult,
} from "@/server/services/export/document";

/**
 * PDF renderer.
 *
 * Reads the same canonical document as the DOCX renderer and reports the same
 * way, so the two cannot disagree about what a demo export carries.
 *
 * No headless browser: this lays the document out directly, which keeps the
 * export path runnable anywhere the app runs rather than requiring a Chromium
 * binary alongside it.
 */

/**
 * Maps a requested font onto one of the three the PDF standard guarantees.
 *
 * Nothing is embedded, so a student asking for Times New Roman gets
 * Times-Roman — metrically the same face — rather than a silently substituted
 * default. Anything unrecognised falls back to a serif, because academic
 * departments overwhelmingly specify one.
 */
function pdfFont(requested: string): string {
  const name = requested.trim().toLowerCase();
  if (/arial|helvetica|calibri|verdana|tahoma|sans/.test(name)) return "Helvetica";
  if (/courier|mono/.test(name)) return "Courier";
  return "Times-Roman";
}

function boldOf(font: string): string {
  if (font === "Helvetica") return "Helvetica-Bold";
  if (font === "Courier") return "Courier-Bold";
  return "Times-Bold";
}

function italicOf(font: string): string {
  if (font === "Helvetica") return "Helvetica-Oblique";
  if (font === "Courier") return "Courier-Oblique";
  return "Times-Italic";
}

function buildStyles(formatting: ExportFormatting) {
  const font = pdfFont(formatting.font);
  const size = formatting.fontSizePt;
  const leading = formatting.lineSpacing;

  return StyleSheet.create({
    page: {
      fontFamily: font,
      fontSize: size,
      paddingTop: formatting.marginInches.top * 72,
      paddingRight: formatting.marginInches.right * 72,
      paddingBottom: formatting.marginInches.bottom * 72 + 24,
      paddingLeft: formatting.marginInches.left * 72,
      // Line spacing deliberately does NOT live here, and must not be moved
      // back. The page furniture below is `fixed`, so react-pdf re-resolves
      // its style on every rendered page and mutates the shared style object
      // in place — an inherited `lineHeight` is multiplied by the font size
      // again on each pass. Once a chapter spilled past roughly a dozen pages
      // the value overflowed and the render died with "unsupported number",
      // which broke every real project while the short sample still passed.
      // Each prose style carries the spacing itself instead.
    },
    paragraph: { marginBottom: 8, textAlign: "justify", lineHeight: leading },
    heading1: {
      fontFamily: boldOf(font),
      fontSize: size + 2,
      textAlign: "center",
      marginTop: 12,
      marginBottom: 14,
    },
    heading2: { fontFamily: boldOf(font), fontSize: size + 1, marginTop: 12, marginBottom: 6 },
    heading3: { fontFamily: boldOf(font), fontSize: size, marginTop: 10, marginBottom: 5 },
    listItem: { marginBottom: 4, paddingLeft: 16, lineHeight: leading },
    table: { marginTop: 6, marginBottom: 10, borderTop: "1pt solid #444", borderLeft: "1pt solid #444" },
    row: { flexDirection: "row" },
    cell: {
      flex: 1,
      padding: 5,
      borderRight: "1pt solid #444",
      borderBottom: "1pt solid #444",
      fontSize: size - 1,
      lineHeight: 1.25,
    },
    placeholder: {
      marginTop: 6,
      marginBottom: 6,
      padding: 6,
      backgroundColor: "#FFF4E5",
      borderLeft: "3pt solid #8A5A00",
      color: "#8A5A00",
      fontFamily: boldOf(font),
      lineHeight: 1.3,
    },
    figure: { textAlign: "center", fontFamily: italicOf(font), marginTop: 6, marginBottom: 6 },
    /* `lineHeight` is set here rather than inherited from the page: a caption
       is prose, and the page style deliberately carries no line spacing —
       inheriting it into `fixed` furniture is what compounded it per rendered
       page and produced "unsupported number: -2.626e+21". */
    caption: {
      textAlign: "center",
      fontFamily: boldOf(font),
      marginTop: 4,
      marginBottom: 8,
      lineHeight: leading,
    },
    reference: { marginBottom: 8, paddingLeft: 28, textIndent: -28, lineHeight: leading },
    // Title page
    titleCentre: { textAlign: "center", marginBottom: 8, lineHeight: leading },
    titleMain: { fontFamily: boldOf(font), fontSize: size + 6, textAlign: "center", marginTop: 40, marginBottom: 10 },
    // Fixed page furniture
    /*
     * Each piece of page furniture is its own fixed, absolutely positioned
     * Text. Wrapping them in a fixed View instead produced a PDF where the
     * footer was silently absent from every page while the watermark rendered
     * fine — the wrapper never laid out, and nothing failed loudly.
     */
    pageNumber: {
      position: "absolute",
      bottom: 22,
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 9,
    },
    footerDisclaimer: {
      position: "absolute",
      bottom: 36,
      left: 0,
      right: 0,
      textAlign: "center",
      color: "#B42318",
      fontFamily: boldOf(font),
      fontSize: 8,
    },
    watermark: {
      position: "absolute",
      top: "40%",
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 96,
      fontFamily: boldOf(font),
      color: "#E4E4E4",
      // Rotated across the page, behind the body, as a watermark should be.
      transform: "rotate(-45deg)",
    },
    disclaimerBlock: {
      marginTop: 30,
      padding: 10,
      border: "1.5pt solid #B42318",
      backgroundColor: "#FDECEB",
      color: "#B42318",
      fontFamily: boldOf(font),
      fontSize: size - 2,
      lineHeight: 1.3,
    },
    tocRow: { flexDirection: "row", marginBottom: 5 },
    tocNumber: { width: 44 },
  });
}

type Styles = ReturnType<typeof buildStyles>;

/** Renders inline runs, preserving emphasis and links. */
function Runs({ runs, font }: { runs: Inline[]; font: string }) {
  return (
    <>
      {runs.map((run, index) => {
        if (run.kind === "link") {
          return (
            <Link key={index} src={run.href} style={{ color: "#16304d" }}>
              {run.text}
            </Link>
          );
        }
        const style: Record<string, string> = {};
        if (run.bold) style.fontFamily = boldOf(font);
        else if (run.italic) style.fontFamily = italicOf(font);
        if (run.strike) style.textDecoration = "line-through";
        return (
          <Text key={index} style={style}>
            {run.text}
          </Text>
        );
      })}
    </>
  );
}

function Blocks({ blocks, styles, font }: { blocks: Block[]; styles: Styles; font: string }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "paragraph":
            return (
              <Text key={index} style={styles.paragraph}>
                <Runs runs={block.runs} font={font} />
              </Text>
            );

          case "heading":
            return (
              <Text key={index} style={block.level === 2 ? styles.heading2 : styles.heading3}>
                <Runs runs={block.runs} font={font} />
              </Text>
            );

          case "list":
            return (
              <View key={index}>
                {block.items.map((item, i) => (
                  <Text key={i} style={styles.listItem}>
                    {block.ordered ? `${i + 1}. ` : "• "}
                    <Runs runs={item} font={font} />
                  </Text>
                ))}
              </View>
            );

          case "table":
            return (
              /* Caption above a table, below a figure — the usual convention.
                 The text is the same one the List of Tables carries, written
                 by a single numbering pass so the two cannot disagree. */
              <View key={index}>
                {block.label ? <Text style={styles.caption}>{block.label}</Text> : null}
              <View style={styles.table}>
                {block.rows.map((row, r) => (
                  <View key={r} style={styles.row} wrap={false}>
                    {row.cells.map((cell, c) => (
                      <Text
                        key={c}
                        style={
                          row.header
                            ? { ...styles.cell, fontFamily: boldOf(font), backgroundColor: "#F0F0ED" }
                            : styles.cell
                        }
                      >
                        <Runs runs={cell} font={font} />
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
              </View>
            );

          case "placeholder":
            return (
              <Text key={index} style={styles.placeholder}>
                [YOUR DATA REQUIRED: {block.label}]
              </Text>
            );

          case "image":
            return (
              <View key={index}>
                <Text style={styles.figure}>[Figure: {block.alt}]</Text>
                {block.label ? <Text style={styles.caption}>{block.label}</Text> : null}
              </View>
            );
        }
      })}
    </>
  );
}

/** Renders the document to a PDF file. */
export async function renderPdf(doc: ExportDocument): Promise<RenderResult> {
  const styles = buildStyles(doc.formatting);
  const font = pdfFont(doc.formatting.font);
  const wants = doc.disclaimer;

  // Recorded as each part is placed, so the flag describes the output.
  let drewTitleBlock = false;
  let drewFooter = false;
  let drewWatermark = false;

  if (wants) {
    drewTitleBlock = true;
    drewFooter = true;
    drewWatermark = true;
  }

  /** Repeated on every page: watermark behind, footer beneath. */
  const PageFurniture = () => (
    <>
      {wants ? (
        <Text style={styles.watermark} fixed>
          {wants.watermark}
        </Text>
      ) : null}
      {wants ? (
        <Text style={styles.footerDisclaimer} fixed>
          {wants.runningFooter}
        </Text>
      ) : null}
      <Text style={styles.pageNumber} fixed render={({ pageNumber }) => String(pageNumber)} />
    </>
  );

  const element = (
    <Document title={doc.title} author={doc.author} subject={doc.topic ?? undefined}>
      <Page size="A4" style={styles.page}>
        <PageFurniture />

        {doc.institution ? (
          <Text style={{ ...styles.titleCentre, fontFamily: boldOf(font) }}>
            {doc.institution.toUpperCase()}
          </Text>
        ) : null}
        {doc.faculty ? <Text style={styles.titleCentre}>{doc.faculty}</Text> : null}
        {doc.department ? <Text style={styles.titleCentre}>{doc.department}</Text> : null}

        <Text style={styles.titleMain}>{doc.title.toUpperCase()}</Text>
        {doc.topic && doc.topic !== doc.title ? (
          <Text style={styles.titleCentre}>{doc.topic}</Text>
        ) : null}

        <Text style={{ ...styles.titleCentre, marginTop: 28 }}>BY</Text>
        <Text style={{ ...styles.titleCentre, fontFamily: boldOf(font) }}>
          {doc.author.toUpperCase()}
        </Text>
        {doc.programme ? (
          <Text style={{ ...styles.titleCentre, marginTop: 14 }}>{doc.programme}</Text>
        ) : null}
        {doc.degree ? <Text style={styles.titleCentre}>{doc.degree}</Text> : null}
        <Text style={{ ...styles.titleCentre, marginTop: 14 }}>{doc.dateLabel}</Text>

        {wants ? <Text style={styles.disclaimerBlock}>{wants.titleBlock}</Text> : null}
      </Page>

      {/* Declaration, Certification, Dedication, Acknowledgements, Abstract —
          each on its own page, which is what a department expects to receive. */}
      {doc.frontMatter.map((page, index) => (
        <Page key={`fm-${index}`} size="A4" style={styles.page} bookmark={page.heading}>
          <PageFurniture />
          <Text style={styles.heading1}>{page.heading}</Text>
          <Blocks blocks={page.blocks} styles={styles} font={font} />
        </Page>
      ))}

      <Page size="A4" style={styles.page} bookmark="Table of Contents">
        <PageFurniture />
        <Text style={styles.heading1}>TABLE OF CONTENTS</Text>
        {doc.chapters.map((chapter, i) => (
          <View key={i}>
            <View style={styles.tocRow}>
              <Text style={{ ...styles.tocNumber, fontFamily: boldOf(font) }}>
                {chapter.number ?? ""}
              </Text>
              <Text style={{ fontFamily: boldOf(font) }}>{chapter.title}</Text>
            </View>
            {chapter.sections.map((section, j) => (
              <View key={j} style={{ ...styles.tocRow, paddingLeft: 18 }}>
                <Text style={styles.tocNumber}>{section.number ?? ""}</Text>
                <Text>{section.title}</Text>
              </View>
            ))}
          </View>
        ))}
        {doc.references.length > 0 ? (
          <View style={{ ...styles.tocRow, marginTop: 6 }}>
            <Text style={{ ...styles.tocNumber, fontFamily: boldOf(font) }} />
            <Text style={{ fontFamily: boldOf(font) }}>References</Text>
          </View>
        ) : null}
      </Page>

      {/* The lists of tables and figures follow the contents, never precede it. */}
      {doc.contentsLists.map((page, index) => (
        <Page key={`cl-${index}`} size="A4" style={styles.page} bookmark={page.heading}>
          <PageFurniture />
          <Text style={styles.heading1}>{page.heading}</Text>
          <Blocks blocks={page.blocks} styles={styles} font={font} />
        </Page>
      ))}

      {doc.chapters.map((chapter, index) => (
        <Page
          key={index}
          size="A4"
          style={styles.page}
          bookmark={
            [chapter.number ? `Chapter ${chapter.number}` : null, chapter.title]
              .filter(Boolean)
              .join(" — ")
          }
        >
          <PageFurniture />
          <Text style={styles.heading1}>
            {[chapter.number ? `CHAPTER ${chapter.number}` : null, chapter.title.toUpperCase()]
              .filter(Boolean)
              .join(" — ")}
          </Text>
          <Blocks blocks={chapter.blocks} styles={styles} font={font} />
          {chapter.sections.map((section, s) => (
            <View key={s}>
              <Text style={styles.heading2}>
                {[section.number, section.title].filter(Boolean).join(" ")}
              </Text>
              <Blocks blocks={section.blocks} styles={styles} font={font} />
            </View>
          ))}
        </Page>
      ))}

      {doc.references.length > 0 ? (
        <Page size="A4" style={styles.page} bookmark="References">
          <PageFurniture />
          <Text style={styles.heading1}>REFERENCES</Text>
          {doc.references.map((reference, index) => (
            <Text key={index} style={styles.reference}>
              {reference}
            </Text>
          ))}
        </Page>
      ) : null}
    </Document>
  );

  const buffer = await renderToBuffer(element);

  return {
    bytes: new Uint8Array(buffer),
    contentType: "application/pdf",
    extension: "pdf",
    disclaimerRendered: drewTitleBlock && drewFooter && drewWatermark,
  };
}
