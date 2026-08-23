"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { fail, ok, type ActionResult } from "@/server/errors";

/**
 * Length and source preferences.
 *
 * Bounds are enforced here rather than trusted from the slider: a request for
 * a two-thousand-page project would burn a great deal of the operator's money
 * before failing, and the client can be bypassed.
 */
const schema = z
  .object({
    projectId: z.string().min(1),
    minPages: z.number().int().min(1).max(500).nullable().optional(),
    maxPages: z.number().int().min(1).max(500).nullable().optional(),
    sourceRecencyYears: z.number().int().min(1).max(50).nullable().optional(),
    retrieveSources: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.minPages == null || value.maxPages == null || value.minPages <= value.maxPages,
    { message: "The minimum page count cannot be larger than the maximum.", path: ["minPages"] },
  );

export async function saveGenerationSettings(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId, ...settings } = schema.parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    await prisma.projectGenerationSettings.upsert({
      where: { projectId: id },
      create: { projectId: id, ...settings },
      update: settings,
    });

    revalidatePath(`/projects/${id}/blueprint`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
