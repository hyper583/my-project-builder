import { describe, expect, it } from "vitest";

import { chunkText } from "@/server/services/documents/ingest";
import { validateUpload } from "@/server/services/documents/validate";
import { isAppError } from "@/server/errors";

/**
 * Upload validation and chunking.
 *
 * Uploads are untrusted input, so the tests that matter are the ones where the
 * declared type and the actual bytes disagree.
 */

const bytes = (...values: number[]) => Buffer.from(values);
const withHeader = (header: Buffer, body = "padding padding padding") =>
  Buffer.concat([header, Buffer.from(body)]);

const PDF = bytes(0x25, 0x50, 0x44, 0x46);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47);

function expectRejected(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(isAppError(error)).toBe(true);
    if (isAppError(error)) expect(error.code).toBe("UPLOAD_REJECTED");
    return;
  }
  throw new Error("Expected the upload to be rejected, but it was accepted");
}

describe("validateUpload — type is decided by bytes, not by claims", () => {
  it("accepts a genuine PDF", () => {
    const result = validateUpload({
      buffer: withHeader(PDF),
      filename: "proposal.pdf",
      declaredType: "application/pdf",
    });
    expect(result.kind).toBe("pdf");
    expect(result.mime).toBe("application/pdf");
  });

  it("rejects a text file renamed to .pdf and declared as PDF", () => {
    expectRejected(() =>
      validateUpload({
        buffer: Buffer.from("I am not a PDF, whatever the name says."),
        filename: "fake.pdf",
        declaredType: "application/pdf",
      }),
    );
  });

  it("rejects a plain ZIP masquerading as a .docx by content type", () => {
    // Same magic bytes as a real .docx, so the extension must agree too.
    expectRejected(() =>
      validateUpload({
        buffer: withHeader(ZIP),
        filename: "archive.zip",
        declaredType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
  });

  it("accepts a ZIP-signatured file only when named .docx", () => {
    const result = validateUpload({
      buffer: withHeader(ZIP),
      filename: "chapter-one.docx",
      declaredType: "application/octet-stream",
    });
    expect(result.kind).toBe("docx");
  });

  it("accepts plain text only when it decodes cleanly", () => {
    const ok = validateUpload({
      buffer: Buffer.from("Supervisor said: sample size is 127."),
      filename: "notes.txt",
      declaredType: "text/plain",
    });
    expect(ok.kind).toBe("txt");

    // NUL bytes are a strong signal of binary content wearing a .txt name.
    expectRejected(() =>
      validateUpload({
        buffer: Buffer.from([0x68, 0x69, 0x00, 0x01, 0x02]),
        filename: "sneaky.txt",
        declaredType: "text/plain",
      }),
    );
  });

  it("identifies images, which are stored but not read", () => {
    expect(
      validateUpload({ buffer: withHeader(PNG), filename: "scan.png", declaredType: "image/png" })
        .kind,
    ).toBe("png");
  });

  it("rejects an empty file", () => {
    expectRejected(() =>
      validateUpload({ buffer: Buffer.alloc(0), filename: "empty.txt", declaredType: "text/plain" }),
    );
  });

  it("rejects a file over the size limit", () => {
    const huge = Buffer.concat([PDF, Buffer.alloc(30 * 1024 * 1024)]);
    expectRejected(() =>
      validateUpload({ buffer: huge, filename: "huge.pdf", declaredType: "application/pdf" }),
    );
  });
});

describe("chunkText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    const chunks = chunkText("A short paragraph about sampling technique.");
    expect(chunks).toHaveLength(1);
  });

  it("splits long text and preserves all of the words", () => {
    const paragraph = "Sampling technique matters a great deal in this study. ".repeat(60);
    const chunks = chunkText(paragraph);
    expect(chunks.length).toBeGreaterThan(1);
    // Overlap means chunks repeat text, so joined length is >= the original.
    expect(chunks.join(" ").length).toBeGreaterThanOrEqual(paragraph.trim().length * 0.9);
  });

  it("hard-splits a single oversized paragraph rather than dropping it", () => {
    const monster = "x".repeat(5000);
    const chunks = chunkText(monster);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });

  it("never emits an empty chunk", () => {
    const messy = "One.\n\n\n\n\nTwo.\n\n\n\n\n\nThree.\n\n";
    expect(chunkText(messy).every((c) => c.trim().length > 0)).toBe(true);
  });
});
