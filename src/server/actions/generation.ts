"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { assertCanGenerate } from "@/server/services/entitlements";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";
import { aiConfigured } from "@/server/services/ai";
import { enqueueGeneration } from "@/server/services/jobs/queue";
import { checkRateLimit } from "@/server/services/rate-limit";

/**
 * Starts a generation run.
 *
 * This only *queues* the work — a worker process picks it up. That is what lets
 * the student close the tab without losing the run, and it is why this returns
 * a job id rather than any generated text.
 */
export async function startGeneration(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  try {
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(input);

    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    if (!aiConfigured) {
      throw new AppError("AI_NOT_CONFIGURED");
    }

    await checkRateLimit(`generate:${user.id}`, ...LIMITS.rateLimit.aiAction);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id },
      select: { kind: true, sections: { select: { id: true }, take: 1 } },
    });

    // A demo project is fixture content; regenerating it would defeat the
    // point of a stable, identical sample.
    if (project.kind === "DEMO") {
      throw new AppError("VALIDATION", {
        message: "The sample project cannot be regenerated",
      });
    }
    if (project.sections.length === 0) {
      throw new AppError("VALIDATION", {
        message: "Choose a chapter structure before generating",
      });
    }

    // Per project, not per account. What the student bought is a pass spent on
    // one project, so the allowance belongs to the project rather than renewing
    // on their account every month.
    const entitlements = await assertCanGenerate(user, id);

    // How far this run is allowed to write. A free project stops after Chapter
    // 1; the pass releases the rest. Enforced at enqueue, where the step rows
    // are built, rather than anywhere the browser can reach.
    const jobId = await enqueueGeneration(id, { maxChapters: entitlements.maxChapters });

    /*
     * The durable record of a run having happened.
     *
     * Written after the enqueue, so a refused run does not consume anything.
     * `GenerationJob` cannot serve this purpose — it cascades away with the
     * project, which would make deleting a project a way to reclaim free runs.
     * This row survives, because `UsageRecord.projectId` is not a foreign key.
     */
    await prisma.usageRecord.create({
      data: {
        userId: user.id,
        projectId: id,
        kind: "AI_GENERATION",
        metadata: {
          jobId,
          basis: entitlements.basis,
          // "all" rather than the number, because an unlimited allowance is
          // Infinity and JSON has no way to write that — it serialises to null,
          // which reads back as "no chapters allowed".
          chapters: Number.isFinite(entitlements.maxChapters) ? entitlements.maxChapters : "all",
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "project.generate",
        targetType: "project",
        targetId: id,
        metadata: { jobId },
      },
    });

    revalidatePath(`/projects/${id}`);
    return ok({ jobId });
  } catch (error) {
    return fail(error);
  }
}

/** Cancels a queued or running job. Completed sections are kept. */
export async function cancelGeneration(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(input);
    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    await prisma.generationJob.updateMany({
      where: { projectId: id, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", completedAt: new Date(), lockedBy: null, heartbeat: null },
    });
    await prisma.project.update({ where: { id }, data: { status: "DRAFT" } });

    revalidatePath(`/projects/${id}`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
