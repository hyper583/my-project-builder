import type { CurrentUser } from "@/server/dal/session";
import { AppError } from "@/server/errors";
import { prisma } from "@/server/db";
import { assembleDocument } from "@/server/services/export/assemble";
import { countPlaceholders, countWords } from "@/server/services/export/document";
import { renderDocx } from "@/server/services/export/docx";
import { renderPdf } from "@/server/services/export/pdf";
import { assertDisclaimer, resolveExportPolicy } from "@/server/services/export/policy";
import { verifyDisclaimer } from "@/server/services/export/verify";
import { buildStorageKey, storage } from "@/server/services/storage";

/**
 * The export pipeline.
 *
 * Policy → assemble → render → verify → assert → store → record.
 *
 * The ordering is the point. Nothing is written to storage until the produced
 * bytes have been read back and shown to carry whatever the policy requires,
 * so a demo export that lost its disclaimer fails loudly instead of becoming a
 * file someone can submit.
 */

export type ExportFormat = "DOCX" | "PDF";

export interface ExportOutcome {
  exportId: string;
  format: ExportFormat;
  filename: string;
  sizeBytes: number;
  hadDisclaimer: boolean;
  words: number;
  placeholders: number;
}

/** Friendly text for each way an export can be refused. */
const DENIAL_MESSAGES: Record<string, string> = {
  NOT_OWNER: "This project belongs to someone else.",
  DEMO_REQUIRES_PAID_PLAN:
    "Exporting a sample project is part of the paid plan. Upgrade to download it, or create " +
    "your own project and export that.",
  REAL_EXPORT_NOT_IN_PLAN: "Exporting is not included in your current plan.",
};

/** A filename a student will recognise in their downloads folder. */
function buildFilename(title: string, extension: string): string {
  const stem =
    title
      .normalize("NFKD")
      // Allowlist rather than a strip-list: a strip-list once ate the letter
      // "r" from a filename because of a lost backslash.
      .replace(/[^A-Za-z0-9 _-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "project";
  return `${stem}.${extension}`;
}

/**
 * Runs an export end to end.
 *
 * Throws `AppError` for anything the student should see a message about, and
 * records a FAILED row for anything else so a broken export is visible rather
 * than silent.
 */
export async function runExport(options: {
  projectId: string;
  format: ExportFormat;
  actor: CurrentUser;
}): Promise<ExportOutcome> {
  const { projectId, format, actor } = options;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      title: true,
      topic: true,
      kind: true,
      userId: true,
      user: { select: { name: true } },
      institution: {
        select: {
          institution: true,
          faculty: true,
          department: true,
          programme: true,
          degree: true,
        },
      },
      formatting: { select: { font: true, fontSize: true, lineSpacing: true, margins: true } },
      sections: {
        select: { id: true, parentId: true, number: true, title: true, content: true, order: true },
      },
      references: {
        orderBy: [{ authors: "asc" }, { year: "asc" }],
        select: {
          authors: true,
          year: true,
          title: true,
          publication: true,
          publisher: true,
          volume: true,
          issue: true,
          pages: true,
          doi: true,
          url: true,
          raw: true,
        },
      },
    },
  });

  // Indistinguishable from a project that does not exist, so an id never leaks.
  if (!project) throw new AppError("NOT_FOUND");

  const policy = resolveExportPolicy(
    { id: actor.id, role: actor.role, planTier: actor.planTier },
    { id: project.id, kind: project.kind, ownerId: project.userId },
  );

  if (!policy.allowed) {
    throw new AppError("FORBIDDEN", {
      message: DENIAL_MESSAGES[policy.reason] ?? "This export is not available on your plan.",
    });
  }

  const record = await prisma.export.create({
    data: { projectId: project.id, userId: actor.id, format, status: "RUNNING" },
    select: { id: true },
  });

  try {
    const document = assembleDocument({
      project: { title: project.title, topic: project.topic, kind: project.kind },
      author: project.user.name,
      institution: project.institution,
      formatting: project.formatting,
      sections: project.sections,
      references: project.references,
      dateLabel: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
        new Date(),
      ),
      withDisclaimer: policy.disclaimer,
    });

    /*
     * A document with no words is a title page and nothing else.
     *
     * Rendering it succeeds, so the student gets a file, opens it, and finds
     * their project missing — having spent an export to learn that. Refusing is
     * both more useful and more honest, and the check is on actual words rather
     * than on whether generation ran, so a project written by hand in the
     * editor exports normally.
     */
    if (countWords(document) === 0) {
      throw new AppError("EXPORT_FAILED", {
        message: `Project ${project.id} has no written content to export`,
        userMessage:
          "There is nothing written to export yet. Generate the project, or write a " +
          "section yourself, and try again.",
      });
    }

    const rendered = format === "DOCX" ? await renderDocx(document) : await renderPdf(document);

    /*
     * The renderer's own report is not trusted. It is read back from the bytes
     * and checked independently, because a renderer has already been observed
     * claiming to have drawn a footer that was absent from every page.
     */
    const verification = await verifyDisclaimer(rendered, document.disclaimer);
    assertDisclaimer(policy, verification.present);

    const key = buildStorageKey(project.id, rendered.extension);
    await storage.put(key, Buffer.from(rendered.bytes), rendered.contentType);

    await prisma.export.update({
      where: { id: record.id },
      data: {
        status: "SUCCEEDED",
        storageKey: key,
        // Recorded so a clean admin export stays distinguishable afterwards.
        hadDisclaimer: verification.present && document.disclaimer !== null,
        completedAt: new Date(),
      },
    });

    await prisma.usageRecord.create({
      data: { userId: actor.id, projectId: project.id, kind: "EXPORT", metadata: { format } },
    });

    /*
     * The admin clean-export path is the only way to obtain an unmarked
     * fabricated academic document, so it is always recorded against a person.
     */
    if (policy.requiresAudit) {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: "EXPORT_DEMO_WITHOUT_DISCLAIMER",
          targetType: "project",
          targetId: project.id,
          metadata: { format, exportId: record.id, projectTitle: project.title },
        },
      });
    }

    return {
      exportId: record.id,
      format,
      filename: buildFilename(project.title, rendered.extension),
      sizeBytes: rendered.bytes.byteLength,
      hadDisclaimer: document.disclaimer !== null,
      words: countWords(document),
      placeholders: countPlaceholders(document),
    };
  } catch (error) {
    await prisma.export.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

/**
 * Reads a completed export back for download.
 *
 * Ownership is re-checked here rather than trusted from the export id, so a
 * guessed id cannot fetch someone else's document.
 */
export async function readExport(
  exportId: string,
  actor: CurrentUser,
): Promise<{ bytes: Buffer; contentType: string; filename: string }> {
  const record = await prisma.export.findFirst({
    where: {
      id: exportId,
      status: "SUCCEEDED",
      // An admin may read any export; anyone else only their own.
      ...(actor.role === "ADMIN" ? {} : { userId: actor.id }),
    },
    select: {
      storageKey: true,
      format: true,
      project: { select: { title: true } },
    },
  });

  if (!record?.storageKey) throw new AppError("NOT_FOUND");

  const extension = record.format === "DOCX" ? "docx" : "pdf";
  return {
    bytes: await storage.get(record.storageKey),
    contentType:
      record.format === "DOCX"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
    filename: buildFilename(record.project.title, extension),
  };
}
