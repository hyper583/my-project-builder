"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireAdmin, requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";
import { claimPass, unclaimedPassCount } from "@/server/services/entitlements";
import { PASS_CURRENCY, PASS_PRICE_KOBO } from "@/config/plans";
import { env, isPaystackConfigured } from "@/lib/env";
import { initialiseTransaction } from "@/server/services/payments/paystack";

/**
 * Buying, and spending, a project pass.
 *
 * There is no payment provider wired up yet, so every pass is granted by an
 * admin. That is deliberate rather than temporary scaffolding: the entitlement
 * model had to be right before money touched it, because the previous one —
 * a permanent `planTier` on the account — would have sold a renewing allowance
 * forever for a single payment.
 *
 * When Paystack lands, its webhook creates the pass with `provider` and
 * `externalId` set and nothing else here changes.
 */

/**
 * Opens a Paystack transaction and returns where to send the student.
 *
 * The amount comes from `PASS_PRICE_KOBO` on the server and is never accepted
 * from the browser — a client-supplied price is a price the client can change.
 * The project is carried in metadata so the webhook can spend the pass on it
 * without asking the student to press a second button after paying.
 *
 * Nothing is granted here. This only opens a transaction; the pass is created
 * by the webhook, after Paystack has been asked what actually happened. A
 * student who closes the tab mid-payment still gets their pass, and one who
 * reaches the callback URL without paying does not.
 */
export async function startPassCheckout(input: unknown): Promise<ActionResult<{ url: string }>> {
  try {
    const { projectId } = z
      .object({ projectId: z.string().min(1).optional() })
      .parse(input ?? {});

    const user = await requireUser();

    if (!isPaystackConfigured) {
      throw new AppError("INTERNAL", {
        message: "Paystack is not configured",
        userMessage: "Payments are not available yet. Please try again later.",
      });
    }

    // Ownership, before the project id is written into payment metadata.
    const target = projectId ? await assertProjectOwnership(projectId, user) : null;

    // Back to where they started. Buying from a project returns to that
    // project's download page; buying a spare pass returns to settings, where
    // the count of them is shown.
    const callbackUrl = target
      ? `${env.BETTER_AUTH_URL}/projects/${target}/export`
      : `${env.BETTER_AUTH_URL}/settings`;

    const { authorizationUrl } = await initialiseTransaction({
      email: user.email,
      amountKobo: PASS_PRICE_KOBO,
      currency: PASS_CURRENCY,
      callbackUrl,
      metadata: { userId: user.id, projectId: target },
    });

    return ok({ url: authorizationUrl });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Grants an unclaimed pass.
 *
 * Recorded with who granted it and why. A pass is a thing of value, so an
 * unexplained one appearing on an account is exactly what an audit trail is
 * for.
 */
export async function grantProjectPass(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { userId, note } = z
      .object({ userId: z.string().min(1), note: z.string().trim().max(200).optional() })
      .parse(input);

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!target) throw new AppError("NOT_FOUND");

    const pass = await prisma.projectPass.create({
      data: {
        userId: target.id,
        grantedByUserId: admin.id,
        note: note?.trim() || null,
        // Granted, not sold. Recording zero keeps the revenue figures honest.
        amountMinor: 0,
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "admin.pass.grant",
        targetType: "user",
        targetId: target.id,
        metadata: { email: target.email, passId: pass.id, note: note ?? null },
      },
    });

    revalidatePath("/admin/users");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Spends one of the student's passes on a project.
 *
 * Explicit rather than automatic. Claiming on the first generation would spend
 * a pass on a project the student may abandon after reading one chapter, and
 * they would have no way to get it back. They choose which project it goes on,
 * at the point they want the document.
 *
 * Irreversible by design — a pass that could be moved between projects is a
 * pass that can release both.
 */
export async function spendPassOnProject(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(input);

    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    const existing = await prisma.projectPass.findUnique({
      where: { projectId: id },
      select: { claimedAt: true },
    });
    if (existing?.claimedAt) {
      throw new AppError("VALIDATION", {
        message: `Project ${id} already carries a pass`,
        userMessage: "This project already has a pass on it.",
      });
    }

    if (!(await claimPass(user.id, id))) {
      throw new AppError("PLAN_LIMIT", {
        message: `No unclaimed pass for user ${user.id}`,
        userMessage:
          "You do not have a pass available. A project pass covers one project — " +
          "generating it, reworking it, and downloading the finished document.",
      });
    }

    revalidatePath(`/projects/${id}/export`);
    revalidatePath(`/projects/${id}/blueprint`);
    revalidatePath("/settings");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** How many passes the signed-in student has left to spend. */
export async function availablePasses(): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requireUser();
    return ok({ count: await unclaimedPassCount(user.id) });
  } catch (error) {
    return fail(error);
  }
}
