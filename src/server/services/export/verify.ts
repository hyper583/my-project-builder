import { strFromU8, unzipSync } from "fflate";

import type { DisclaimerSpec, RenderResult } from "@/server/services/export/document";

/**
 * Independent verification that a demo export is actually marked.
 *
 * A renderer reporting `disclaimerRendered: true` is a claim about intent, and
 * intent is not what reaches the student. That distinction is not theoretical:
 * the PDF renderer reported all three markings while its running footer was
 * absent from every page, because a wrapper element never laid out and nothing
 * failed loudly.
 *
 * So the pipeline reads the produced bytes back and looks for the markings
 * itself, and `assertDisclaimer` gates on this rather than on the renderer's
 * word. A silent omission becomes a failed export instead of a clean file.
 *
 * The two formats need different tools, and only one of them is cheap:
 *
 * - **DOCX** is a zip of XML. Unzipping and reading the parts finds the text
 *   directly, in a few milliseconds.
 * - **PDF** cannot be scanned. react-pdf embeds subset fonts and writes text
 *   as hex-encoded glyph indices, so the bytes contain no readable strings at
 *   all — inflating the content streams yields `TJ` operators over glyph ids
 *   and not one string literal. Recovering characters needs the font's
 *   ToUnicode map, which means a real PDF text extractor.
 *
 * pdf.js is used for the PDF case. It costs a few hundred milliseconds, which
 * is worth paying on the one path in the product that could otherwise release
 * an unmarked fabricated academic document.
 */

/**
 * Lower-cased, punctuation-stripped, single-spaced.
 *
 * Renderers hyphenate, line-break and re-encode punctuation, so comparing raw
 * strings produces false failures on output that is correctly marked.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The last few words of a string, normalised. */
function tailPhrase(text: string, words = 4): string {
  return normalise(text).split(" ").slice(-words).join(" ");
}

/**
 * A distinct fragment of each marking that must be findable in the output.
 *
 * Tails rather than heads: every marking opens with "SAMPLE PROJECT", so
 * matching on opening words would let a file carrying only the footer satisfy
 * the check for the title block too. The closing words differ, so each marking
 * is verified independently.
 */
function requiredPhrases(spec: DisclaimerSpec): string[] {
  return [tailPhrase(spec.titleBlock), tailPhrase(spec.runningFooter), spec.watermark];
}

/** Every text fragment recoverable from a .docx, as one string. */
function readDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  return Object.entries(files)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, content]) => strFromU8(content))
    .join("\n");
}

/** Every text fragment recoverable from a PDF, as one string. */
async function readPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await pdfjs.getDocument({
    // A copy: pdf.js transfers and detaches the buffer it is handed, and the
    // caller still needs these bytes to store the file.
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  try {
    const pages: string[] = [];
    for (let page = 1; page <= doc.numPages; page += 1) {
      const content = await (await doc.getPage(page)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join("\n");
  } finally {
    await doc.destroy();
  }
}

export interface VerificationResult {
  /** True only when every required marking was found in the produced bytes. */
  readonly present: boolean;
  /** Which markings could not be found — named so a failure is diagnosable. */
  readonly missing: string[];
}

/**
 * Reads a rendered file back and reports which disclaimer markings are in it.
 *
 * Returns `present: true` for a document that is not supposed to carry one, so
 * callers can use a single code path for both.
 */
export async function verifyDisclaimer(
  result: RenderResult,
  spec: DisclaimerSpec | null,
): Promise<VerificationResult> {
  if (!spec) return { present: true, missing: [] };

  let text: string;
  try {
    text =
      result.extension === "docx"
        ? readDocxText(result.bytes)
        : await readPdfText(result.bytes);
  } catch {
    // Output that cannot be read back cannot be shown to be marked.
    return { present: false, missing: ["output could not be read back"] };
  }

  const haystack = normalise(text);
  const missing = requiredPhrases(spec).filter((phrase) => !haystack.includes(normalise(phrase)));

  return { present: missing.length === 0, missing };
}
