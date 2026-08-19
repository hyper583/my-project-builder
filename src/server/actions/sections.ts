"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { fail, ok, type ActionResult } from "@/server/errors";

/**
 * Section editing.
 *
 * Autosave writes through to Postgres on a debounce. Nothing of substance is
 * held only in the browser, which is what makes "close the laptop and come
 * back" work rather than being a promise the UI cannot keep.
 */

const PLACEHOLDER_PATTERN = /\[STUDENT DATA REQUIRED:\s*([^\]]+)\]/gi;

const saveSchema = z.object({
  projectId: z.string().min(1),
  sectionId: z.string().min(1),
  /** TipTap HTML. Length-capped so one runaway paste cannot fill the row. */
  html: z.string().max(400_000),
  /** Plain text, used for word count and placeholder detection. */
  text: z.string().max(400_000),
});

export async function saveSection(
  input: unknown,
): Promise<ActionResult<{ wordCount: number; placeholders: number; savedAt: string }>> {
  try {
    const { projectId, sectionId, html, text } = saveSchema.parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    // The section must belong to the project the caller proved they own —
    // otherwise a valid project id could be paired with someone else's section.
    const section = await prisma.projectSection.findFirst({
      where: { id: sectionId, projectId: id },
      select: { id: true },
    });
    if (!section) {
      return fail(new Error("Section not found"));
    }

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    await prisma.projectSection.update({
      where: { id: section.id },
      data: { content: html, wordCount },
    });

    // Keep the placeholder tally honest as the student writes: resolving a
    // placeholder by replacing it with real data should reduce the count.
    await prisma.sectionPlaceholder.deleteMany({
      where: { sectionId: section.id, resolved: false },
    });
    const found = [...text.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]!.trim());
    if (found.length > 0) {
      await prisma.sectionPlaceholder.createMany({
        data: found.map((detail) => ({
          sectionId: section.id,
          label: "STUDENT DATA REQUIRED",
          detail: detail.slice(0, 500),
        })),
      });
    }

    return ok({
      wordCount,
      placeholders: found.length,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error);
  }
}

const renameSchema = z.object({
  projectId: z.string().min(1),
  sectionId: z.string().min(1),
  title: z.string().trim().min(1).max(300),
});

export async function renameSection(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId, sectionId, title } = renameSchema.parse(input);
    const id = await assertProjectOwnership(projectId);
    const updated = await prisma.projectSection.updateMany({
      where: { id: sectionId, projectId: id },
      data: { title },
    });
    if (updated.count === 0) return fail(new Error("Section not found"));
    revalidatePath(`/projects/${id}/workspace`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
