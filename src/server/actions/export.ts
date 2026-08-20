"use server";

import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { requireUser } from "@/server/dal/session";
import { fail, ok, type ActionResult } from "@/server/errors";
import { runExport, type ExportOutcome } from "@/server/services/export";
import { checkRateLimit } from "@/server/services/rate-limit";

const schema = z.object({
  projectId: z.string().min(1),
  format: z.enum(["DOCX", "PDF"]),
});

/**
 * Produces an export and returns its id for download.
 *
 * Runs inline rather than through the job queue: a document is assembled from
 * data already in the database, so it completes in a moment and the student
 * gets the file rather than a progress bar to watch. Generation is queued
 * because it calls a model for minutes; this does not.
 *
 * Every authorisation decision lives in `runExport`, which resolves the export
 * policy and refuses to write a demo export whose disclaimer is not actually
 * present in the produced bytes.
 */
export async function startExport(input: unknown): Promise<ActionResult<ExportOutcome>> {
  try {
    const { projectId, format } = schema.parse(input);
    const user = await requireUser();

    // Rendering is CPU-bound, so the limit is on the person rather than on the
    // project — a loop over a project's export button is the thing to stop.
    await checkRateLimit(`export:${user.id}`, ...LIMITS.rateLimit.aiAction);

    return ok(await runExport({ projectId, format, actor: user }));
  } catch (error) {
    return fail(error);
  }
}
