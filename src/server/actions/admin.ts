"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";

/**
 * Admin actions.
 *
 * Every one of these is an admin acting on someone else's work, so every one
 * writes an `AuditLog` row. That is the whole basis on which the console is
 * defensible: the capability exists, but it is never silent.
 *
 * `requireAdmin()` throws NOT_FOUND rather than a forbidden error, so a student
 * calling one of these learns nothing about whether it exists.
 */

const jobSchema = z.object({ jobId: z.string().min(1) });

/**
 * Puts a stalled job back in the queue.
 *
 * Resets `attempts`, which is the part that matters: a job at its attempt
 * ceiling can never be claimed again, so clearing the error without clearing
 * the count would leave it exactly as stuck while looking repaired.
 *
 * Completed steps are left SUCCEEDED, so the run resumes rather than starting
 * over and rewriting sections that are already fine.
 */
export async function requeueGenerationJob(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { jobId } = jobSchema.parse(input);

    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: { id: true, projectId: true, status: true, provider: true },
    });
    if (!job) throw new AppError("NOT_FOUND");

    if (job.status === "RUNNING") {
      // Not a hard block on the row, but requeueing something a worker is
      // actively writing would put two of them on the same sections.
      throw new AppError("CONFLICT", {
        message: "That job is running. Wait for it to finish or fail before requeueing.",
      });
    }

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        attempts: 0,
        error: null,
        lockedBy: null,
        lockedAt: null,
        heartbeat: null,
        completedAt: null,
      },
    });

    // The project goes back to GENERATING so the student's own progress view
    // agrees with the queue rather than showing a draft that is about to move.
    await prisma.project.update({
      where: { id: job.projectId },
      data: { status: "GENERATING" },
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "admin.job.requeue",
        targetType: "generation_job",
        targetId: job.id,
        metadata: { projectId: job.projectId, provider: job.provider },
      },
    });

    revalidatePath("/admin");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

const errorSchema = z.object({ errorId: z.string().min(1) });

/**
 * Reveals the full text of an error record.
 *
 * Error messages can carry student prose — an AI failure quotes the draft it
 * was working on, an extraction failure quotes the document. The console lists
 * a sanitised summary; seeing the rest is a deliberate act and is logged as
 * one, on the same terms as opening a student's project.
 */
export async function revealErrorDetail(
  input: unknown,
): Promise<ActionResult<{ detail: string; stack: string | null }>> {
  try {
    const admin = await requireAdmin();
    const { errorId } = errorSchema.parse(input);

    const record = await prisma.errorLog.findUnique({
      where: { id: errorId },
      select: { id: true, detail: true, stack: true, code: true, userId: true, projectId: true },
    });
    if (!record) throw new AppError("NOT_FOUND");

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "admin.error.reveal",
        targetType: "error_log",
        targetId: record.id,
        metadata: {
          code: record.code,
          subjectUserId: record.userId,
          projectId: record.projectId,
        },
      },
    });

    return ok({ detail: record.detail ?? "", stack: record.stack });
  } catch (error) {
    return fail(error);
  }
}
