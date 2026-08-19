import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { extractText, normaliseText } from "@/server/services/documents/extract";
import { validateUpload } from "@/server/services/documents/validate";
import { buildStorageKey, sha256, storage } from "@/server/services/storage";

/**
 * Document ingestion pipeline.
 *
 *   validate → store original → extract text → chunk → index → link to project
 *
 * The original file is never modified. Extracted text lives in its own row so
 * the source of truth stays the file the student actually uploaded.
 */

const TARGET_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;

/**
 * Splits text on paragraph boundaries, packing paragraphs up to a target size.
 * A small overlap is carried between chunks so a sentence spanning a boundary
 * is still retrievable from one of them.
 */
export function chunkText(text: string): string[] {
  const clean = normaliseText(text);
  if (clean.length === 0) return [];
  if (clean.length <= TARGET_CHUNK_CHARS) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
  };

  for (const paragraph of paragraphs) {
    // A single oversized paragraph is hard-split rather than dropped.
    if (paragraph.length > TARGET_CHUNK_CHARS) {
      push();
      current = "";
      for (let i = 0; i < paragraph.length; i += TARGET_CHUNK_CHARS - CHUNK_OVERLAP_CHARS) {
        chunks.push(paragraph.slice(i, i + TARGET_CHUNK_CHARS).trim());
      }
      continue;
    }
    if (current.length + paragraph.length + 2 > TARGET_CHUNK_CHARS) {
      push();
      const tail = current.slice(-CHUNK_OVERLAP_CHARS);
      current = `${tail}\n\n${paragraph}`;
    } else {
      current = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    }
  }
  push();
  return chunks.filter((c) => c.length > 0);
}

/** Rough token estimate. Good enough for budgeting context, not for billing. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export interface IngestResult {
  documentId: string;
  filename: string;
  extractionStatus: string;
  chunks: number;
  note?: string;
}

export async function ingestDocument(params: {
  projectId: string;
  filename: string;
  declaredType: string;
  category?: string | null;
  buffer: Buffer;
}): Promise<IngestResult> {
  const { projectId, filename, declaredType, category, buffer } = params;

  // 1. Validate — magic bytes, not the declared type.
  const validated = validateUpload({ buffer, filename, declaredType });

  const digest = sha256(validated.buffer);
  const duplicate = await prisma.projectDocument.findFirst({
    where: { projectId, sha256: digest },
    select: { id: true, originalName: true },
  });
  if (duplicate) {
    throw new AppError("UPLOAD_REJECTED", {
      message: `Already uploaded as "${duplicate.originalName}"`,
    });
  }

  // 2. Store the original, under a generated key.
  const storageKey = buildStorageKey(projectId, validated.extension);
  await storage.put(storageKey, validated.buffer, validated.mime);

  const document = await prisma.projectDocument.create({
    data: {
      projectId,
      filename: storageKey.split("/").pop() ?? filename,
      originalName: filename.slice(0, 300),
      mimeType: validated.mime,
      sizeBytes: validated.sizeBytes,
      sha256: digest,
      storageKey,
      category: category ?? null,
    },
    select: { id: true },
  });

  // 3. Extract.
  const outcome = await extractText(validated.kind, validated.buffer);

  if (outcome.status !== "COMPLETE") {
    await prisma.documentExtraction.create({
      data: {
        documentId: document.id,
        status: outcome.status,
        error: outcome.reason,
      },
    });
    await linkSource(projectId, document.id, filename);
    return {
      documentId: document.id,
      filename,
      extractionStatus: outcome.status,
      chunks: 0,
      note: outcome.reason,
    };
  }

  const text = normaliseText(outcome.text);
  const extraction = await prisma.documentExtraction.create({
    data: {
      documentId: document.id,
      status: "COMPLETE",
      text,
      pages: outcome.pages,
      metadata: outcome.metadata as object,
    },
    select: { id: true },
  });

  // 4. Chunk and index.
  const chunks = chunkText(text);
  if (chunks.length > 0) {
    await prisma.documentChunk.createMany({
      data: chunks.map((content, index) => ({
        extractionId: extraction.id,
        order: index,
        text: content,
        tokenEst: estimateTokens(content),
      })),
    });
  }

  // 5. Make it part of the project's source library.
  await linkSource(projectId, document.id, filename);

  return {
    documentId: document.id,
    filename,
    extractionStatus: "COMPLETE",
    chunks: chunks.length,
    note: chunks.length === 0 ? "No readable text was found in this file." : undefined,
  };
}

async function linkSource(projectId: string, documentId: string, title: string) {
  await prisma.projectSource.create({
    data: { projectId, kind: "UPLOAD", title: title.slice(0, 300), documentId },
  });
}

/** Removes a document, its extraction, chunks, source entry and stored file. */
export async function removeDocument(projectId: string, documentId: string): Promise<void> {
  const document = await prisma.projectDocument.findFirst({
    where: { id: documentId, projectId },
    select: { id: true, storageKey: true },
  });
  if (!document) throw new AppError("NOT_FOUND");

  // ProjectSource.documentId is SetNull, not Cascade, because a source can
  // legitimately exist without a file (a note, or a manually added reference).
  // That means the upload's source row must be removed explicitly, or deleting
  // a document leaves a phantom entry in the source library.
  await prisma.projectSource.deleteMany({ where: { projectId, documentId: document.id } });

  // Cascades clear the extraction and its chunks.
  await prisma.projectDocument.delete({ where: { id: document.id } });
  await storage.delete(document.storageKey);
}
