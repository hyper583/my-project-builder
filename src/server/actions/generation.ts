"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { entitlementsFor } from "@/config/plans";
import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
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

    const plan = entitlementsFor(user.planTier);
    // Count generation RUNS, not usage records — the pipeline writes one usage
    // record per section, so counting those would cap a student at one section
    // rather than one project.
    const used = await prisma.generationJob.count({
      where: {
        project: { userId: user.id },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) },
        status: { in: ["QUEUED", "RUNNING", "SUCCEEDED"] },
      },
    });
    if (plan.maxGenerationsPerMonth > 0 && used >= plan.maxGenerationsPerMonth) {
      throw new AppError("PLAN_LIMIT", { message: "Monthly generation limit reached" });
    }

    const jobId = await enqueueGeneration(id);

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
