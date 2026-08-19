import type { AcceptedKind } from "@/server/services/documents/validate";

/**
 * Text extraction.
 *
 * Extracted text is stored separately from the original file, which is kept
 * untouched. Extraction failures are recorded rather than thrown, so one
 * unreadable document never blocks the rest of a project's uploads.
 */

export type ExtractionOutcome =
  | { status: "COMPLETE"; text: string; pages: number | null; metadata: Record<string, unknown> }
  | { status: "UNSUPPORTED"; reason: string }
  | { status: "FAILED"; reason: string };

async function extractPdf(buffer: Buffer): Promise<ExtractionOutcome> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return {
      status: "COMPLETE",
      text: result.text ?? "",
      pages: result.pages?.length ?? null,
      metadata: { pageCount: result.pages?.length ?? null },
    };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractionOutcome> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return {
    status: "COMPLETE",
    text: result.value ?? "",
    pages: null,
    metadata: { warnings: result.messages?.map((m) => m.message) ?? [] },
  };
}

function extractTxt(buffer: Buffer): ExtractionOutcome {
  return {
    status: "COMPLETE",
    text: buffer.toString("utf8"),
    pages: null,
    metadata: {},
  };
}

export async function extractText(kind: AcceptedKind, buffer: Buffer): Promise<ExtractionOutcome> {
  try {
    switch (kind) {
      case "pdf":
        return await extractPdf(buffer);
      case "docx":
        return await extractDocx(buffer);
      case "txt":
        return extractTxt(buffer);
      case "png":
      case "jpeg":
        // Images are stored and listed, but not read. This is surfaced in the
        // UI rather than left as a silent gap — OCR is not implemented.
        return {
          status: "UNSUPPORTED",
          reason: "Images are stored with your project but their text is not read (no OCR yet).",
        };
    }
  } catch (error) {
    // Logged server-side; the student sees a friendly message and can retry.
    console.error("[extract] failed", error);
    return {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "Unknown extraction error",
    };
  }
}

/** Collapses the runs of whitespace that PDF extraction tends to produce. */
export function normaliseText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
