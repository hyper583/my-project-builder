"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { fail, ok, type ActionResult } from "@/server/errors";
import {
  createVersion,
  restoreVersion,
  type RestoreOutcome,
  type VersionSummary,
} from "@/server/services/versions";

/**
 * Version history actions.
 *
 * Ownership is proved before anything is read or written. The service layer
 * scopes every version query to the project as well, so a version id belonging
 * to another project cannot be restored over this one even if it were guessed.
 */

const saveSchema = z.object({
  projectId: z.string().min(1),
  label: z.string().trim().max(200).optional(),
});

export async function saveVersion(input: unknown): Promise<ActionResult<VersionSummary>> {
  try {
    const { projectId, label } = saveSchema.parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    const version = await createVersion(id, label?.trim() || "Saved by you");
    revalidatePath(`/projects/${id}/workspace`);
    return ok(version);
  } catch (error) {
    return fail(error);
  }
}

const restoreSchema = z.object({
  projectId: z.string().min(1),
  versionId: z.string().min(1),
});

export async function restoreProjectVersion(
  input: unknown,
): Promise<ActionResult<RestoreOutcome>> {
  try {
    const { projectId, versionId } = restoreSchema.parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    const outcome = await restoreVersion(id, versionId);

    // The workspace renders section content directly, so it must not keep
    // serving the pre-restore document from cache.
    revalidatePath(`/projects/${id}/workspace`);
    revalidatePath(`/projects/${id}/blueprint`);
    return ok(outcome);
  } catch (error) {
    return fail(error);
  }
}
