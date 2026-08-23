"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { fail, ok, type ActionResult } from "@/server/errors";
import { analyseProject, setIssueStatus, type AnalysisResult } from "@/server/services/consistency";
import { checkRateLimit } from "@/server/services/rate-limit";

/**
 * Consistency actions.
 *
 * The analysis is deterministic and calls no model, so it is not gated on the
 * AI provider or on plan limits — a student should always be able to ask
 * whether their document contradicts itself. It is still rate-limited, because
 * it reads the whole project.
 */

export async function runAnalysis(input: unknown): Promise<ActionResult<AnalysisResult>> {
  try {
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    await checkRateLimit(`consistency:${user.id}`, ...LIMITS.rateLimit.aiAction);

    const result = await analyseProject(id);
    revalidatePath(`/projects/${id}/blueprint`);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

const statusSchema = z.object({
  projectId: z.string().min(1),
  issueId: z.string().min(1),
  status: z.enum(["OPEN", "DISMISSED"]),
});

export async function updateIssueStatus(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId, issueId, status } = statusSchema.parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    await setIssueStatus(id, issueId, status);
    revalidatePath(`/projects/${id}/blueprint`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
