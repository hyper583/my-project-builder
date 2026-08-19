import { LIMITS } from "@/config/limits";
import { AppError } from "@/server/errors";

/**
 * Upload validation.
 *
 * Uploaded files are untrusted. The declared MIME type and the filename
 * extension are both attacker-controlled, so neither is trusted on its own —
 * the file's actual leading bytes decide what it is.
 */

export type AcceptedKind = "pdf" | "docx" | "txt" | "png" | "jpeg";

interface Signature {
  readonly kind: AcceptedKind;
  readonly mime: string;
  readonly extension: string;
  readonly magic: readonly number[];
  /** Offset at which the magic bytes appear. */
  readonly offset?: number;
}

const SIGNATURES: readonly Signature[] = [
  // %PDF
  { kind: "pdf", mime: "application/pdf", extension: ".pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  // DOCX is a ZIP container: PK\x03\x04
  {
    kind: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
  { kind: "png", mime: "image/png", extension: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { kind: "jpeg", mime: "image/jpeg", extension: ".jpg", magic: [0xff, 0xd8, 0xff] },
];

export interface ValidatedUpload {
  readonly kind: AcceptedKind;
  readonly mime: string;
  readonly extension: string;
  readonly buffer: Buffer;
  readonly sizeBytes: number;
}

function matches(buffer: Buffer, sig: Signature): boolean {
  const offset = sig.offset ?? 0;
  if (buffer.length < offset + sig.magic.length) return false;
  return sig.magic.every((byte, i) => buffer[offset + i] === byte);
}

/** Plain text has no magic number, so it is accepted only if it decodes cleanly. */
function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096);
  // Reject anything containing NUL bytes — a strong signal of binary content.
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

export function validateUpload(file: {
  buffer: Buffer;
  filename: string;
  declaredType: string;
}): ValidatedUpload {
  const { buffer, filename } = file;

  if (buffer.length === 0) {
    throw new AppError("UPLOAD_REJECTED", { message: "Empty file" });
  }
  if (buffer.length > LIMITS.upload.maxBytes) {
    throw new AppError("UPLOAD_REJECTED", {
      message: `File exceeds ${Math.round(LIMITS.upload.maxBytes / 1024 / 1024)}MB`,
    });
  }

  const signature = SIGNATURES.find((sig) => matches(buffer, sig));
  if (signature) {
    // A DOCX and a plain ZIP share a signature. Require the extension to agree
    // so a renamed archive is not accepted as a Word document.
    if (signature.kind === "docx" && !filename.toLowerCase().endsWith(".docx")) {
      throw new AppError("UPLOAD_REJECTED", {
        message: "ZIP container that is not a .docx",
      });
    }
    return {
      kind: signature.kind,
      mime: signature.mime,
      extension: signature.extension,
      buffer,
      sizeBytes: buffer.length,
    };
  }

  if (filename.toLowerCase().endsWith(".txt") && looksLikeText(buffer)) {
    return {
      kind: "txt",
      mime: "text/plain",
      extension: ".txt",
      buffer,
      sizeBytes: buffer.length,
    };
  }

  throw new AppError("UPLOAD_REJECTED", {
    message: `Unrecognised file type for ${filename}`,
  });
}
