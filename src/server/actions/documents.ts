"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { fail, ok, type ActionResult } from "@/server/errors";
import { removeDocument } from "@/server/services/documents/ingest";

export async function deleteDocument(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId, documentId } = z
      .object({ projectId: z.string().min(1), documentId: z.string().min(1) })
      .parse(input);

    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    await removeDocument(id, documentId);
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "document.delete",
        targetType: "document",
        targetId: documentId,
      },
    });

    revalidatePath(`/projects/${id}/wizard/6`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Searches a project's extracted document text. Ownership-checked. */
export async function searchSources(input: unknown): Promise<
  ActionResult<Array<{ documentId: string; name: string; snippet: string }>>
> {
  try {
    const { projectId, query } = z
      .object({ projectId: z.string().min(1), query: z.string().trim().min(2).max(200) })
      .parse(input);
    const id = await assertProjectOwnership(projectId);

    const rows = await prisma.$queryRaw<
      Array<{ documentId: string; name: string; snippet: string }>
    >`
      SELECT d.id AS "documentId",
             d."originalName" AS name,
             ts_headline('english', c.text, plainto_tsquery('english', ${query}),
                         'MaxFragments=1,MaxWords=30,MinWords=10') AS snippet
      FROM document_chunk c
      JOIN document_extraction e ON e.id = c."extractionId"
      JOIN project_document d ON d.id = e."documentId"
      WHERE d."projectId" = ${id}
        AND to_tsvector('english', c.text) @@ plainto_tsquery('english', ${query})
      LIMIT 20
    `;
    return ok(rows);
  } catch (error) {
    return fail(error);
  }
}
