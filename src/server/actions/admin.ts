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
        userMessage: "That job is running. Wait for it to finish or fail before requeueing.",
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

/* ------------------------------------------------------------------
   People
   ------------------------------------------------------------------ */

const targetSchema = z.object({ userId: z.string().min(1) });

/**
 * Loads the target and refuses the two ways an admin can lock everyone out.
 *
 * Self-action is refused because an admin removing their own access is almost
 * always a misclick, and the recovery — editing the database by hand — is worse
 * than the inconvenience of asking a colleague.
 *
 * Removing the last active admin is refused for the harder reason: there is no
 * self-service route back. `ADMIN_BOOTSTRAP_EMAIL` only promotes on user
 * CREATION, so an existing account cannot be re-promoted by restarting with the
 * variable set. The product would need a database edit to administer again.
 */
async function loadTarget(adminId: string, userId: string, verb: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, planTier: true, suspendedAt: true },
  });
  if (!target) throw new AppError("NOT_FOUND");

  if (target.id === adminId) {
    throw new AppError("VALIDATION", {
      userMessage: `You cannot ${verb} your own account. Ask another admin.`,
    });
  }

  return target;
}

/** Whether removing this account's access would leave nobody able to administer. */
async function assertNotLastAdmin(target: { role: string; suspendedAt: Date | null }, verb: string) {
  if (target.role !== "ADMIN" || target.suspendedAt) return;

  const remaining = await prisma.user.count({ where: { role: "ADMIN", suspendedAt: null } });
  if (remaining <= 1) {
    throw new AppError("VALIDATION", {
      userMessage: `That is the only active admin. Promote someone else before you ${verb} them.`,
    });
  }
}

async function audit(adminId: string, action: string, target: { id: string; email: string }, metadata: Record<string, unknown> = {}) {
  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action,
      targetType: "user",
      targetId: target.id,
      // The email is recorded alongside the id so the trail stays readable
      // after an account is deleted and the id no longer resolves.
      metadata: { subjectEmail: target.email, ...metadata },
    },
  });
}

/**
 * Suspends an account.
 *
 * Takes effect on the suspended user's very next request: `getCurrentUser`
 * re-reads suspension from the database rather than trusting the session
 * payload, so there is no window where an existing session still works.
 */
export async function setUserSuspended(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { userId, suspended } = targetSchema.extend({ suspended: z.boolean() }).parse(input);

    const target = await loadTarget(admin.id, userId, suspended ? "suspend" : "restore");
    if (suspended) await assertNotLastAdmin(target, "suspend");

    await prisma.user.update({
      where: { id: target.id },
      data: { suspendedAt: suspended ? new Date() : null },
    });

    await audit(admin.id, suspended ? "admin.user.suspend" : "admin.user.restore", target);

    revalidatePath("/admin/users");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Changes a role.
 *
 * Never self-service, and never inferred from anything a registration payload
 * can set — `role` is `input: false` in the auth config, so this action and the
 * bootstrap hook are the only two ways an account becomes an admin.
 */
export async function setUserRole(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { userId, role } = targetSchema
      .extend({ role: z.enum(["STUDENT", "ADMIN"]) })
      .parse(input);

    const target = await loadTarget(admin.id, userId, "change the role of");
    if (role === "STUDENT") await assertNotLastAdmin(target, "demote");

    if (target.role === role) return ok(null);

    await prisma.user.update({ where: { id: target.id }, data: { role } });
    await audit(admin.id, "admin.user.role", target, { from: target.role, to: role });

    revalidatePath("/admin/users");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Changes a plan tier.
 *
 * This is the one admin action that gives something away, so it is recorded
 * with both the old and new tier — "who made this account paid, and when" is
 * the question that gets asked later, and an audit row saying only that a
 * change happened would not answer it.
 *
 * It deliberately does not touch `Subscription`. That row reflects what a
 * payment provider believes, and overwriting it here would make the two
 * disagree silently. A comped account is a deliberate override of the tier,
 * not a fabricated payment.
 */
export async function setUserPlan(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { userId, planTier } = targetSchema
      .extend({ planTier: z.enum(["FREE", "PAID"]) })
      .parse(input);

    const target = await loadTarget(admin.id, userId, "change the plan of");
    if (target.planTier === planTier) return ok(null);

    await prisma.user.update({ where: { id: target.id }, data: { planTier } });
    await audit(admin.id, "admin.user.plan", target, { from: target.planTier, to: planTier });

    revalidatePath("/admin/users");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------
   Project content
   ------------------------------------------------------------------ */

const projectSchema = z.object({ projectId: z.string().min(1) });

export interface RevealedSection {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
  readonly content: string;
  readonly words: number;
}

/**
 * Returns what a student actually wrote, and records that it was read.
 *
 * This is the one capability in the console that reaches into someone's
 * unpublished work, so the terms matter more than the mechanism:
 *
 * The audit row is written BEFORE the content is read out of the database. If
 * the write fails the whole action fails and nothing is returned — access and
 * the record of it are the same event, and an admin must not be able to end up
 * having read something the trail does not show.
 *
 * It is an action rather than a page for the same reason. A route that audited
 * on load would fire on Next's prefetch and on every refresh, recording page
 * loads instead of decisions — which is both noisy and untrue. Pressing a
 * button that says it will be recorded is a deliberate act; navigating is not.
 *
 * Read-only by construction: nothing here can write to a project, so support
 * can investigate a complaint without ever being able to alter the work.
 */
export async function revealProjectContent(
  input: unknown,
): Promise<ActionResult<{ sections: RevealedSection[] }>> {
  try {
    const admin = await requireAdmin();
    const { projectId } = projectSchema.parse(input);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, title: true, kind: true, userId: true, user: { select: { email: true } } },
    });
    if (!project) throw new AppError("NOT_FOUND");

    // Deliberately first. See the docblock.
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "admin.project.read",
        targetType: "project",
        targetId: project.id,
        metadata: {
          projectTitle: project.title,
          kind: project.kind,
          ownerId: project.userId,
          ownerEmail: project.user.email,
        },
      },
    });

    const sections = await prisma.projectSection.findMany({
      where: { projectId: project.id, parentId: { not: null } },
      orderBy: [{ parentId: "asc" }, { order: "asc" }],
      select: { id: true, number: true, title: true, content: true, wordCount: true },
    });

    return ok({
      sections: sections.map((section) => ({
        id: section.id,
        number: section.number,
        title: section.title,
        content: section.content ?? "",
        words: section.wordCount,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
