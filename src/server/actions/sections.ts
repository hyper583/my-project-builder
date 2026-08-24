"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { fail, ok, type ActionResult } from "@/server/errors";
import { assertSectionUnlocked, projectEntitlements } from "@/server/services/entitlements";
import { syncPlaceholders } from "@/server/services/placeholders";

/**
 * Section editing.
 *
 * Autosave writes through to Postgres on a debounce. Nothing of substance is
 * held only in the browser, which is what makes "close the laptop and come
 * back" work rather than being a promise the UI cannot keep.
 */


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

    /*
     * Not into a chapter the project has not paid for.
     *
     * Typing here is not a disclosure — it is the student's own text — but the
     * workspace withholds locked chapters by position, so anything saved into
     * one is written and then never shown again. A silent black hole is worse
     * than a refusal that explains itself.
     *
     * It also keeps `wordCount` meaning what the generator assumes it means:
     * a locked chapter marked "written" would be skipped by the run the
     * student later pays for.
     */
    await assertSectionUnlocked(await projectEntitlements(user, id), id, section.id);

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    await prisma.projectSection.update({
      where: { id: section.id },
      data: { content: html, wordCount },
    });

    // Keep the placeholder tally honest as the student writes: resolving a
    // placeholder by replacing it with real data should reduce the count.
    const placeholders = await syncPlaceholders(section.id, text);

    return ok({
      wordCount,
      placeholders,
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
