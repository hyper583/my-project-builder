import { PASS_CURRENCY, PASS_PRICE_KOBO } from "@/config/plans";
import { prisma } from "@/server/db";
import { verifyTransaction } from "@/server/services/payments/paystack";

/**
 * Turning a paid transaction into a pass.
 *
 * Extracted from the webhook because it needs two callers, not because it was
 * untidy there. Paystack cannot reach a development machine, so until this app
 * has a public address the webhook never fires and the return page is the only
 * thing that can complete a payment. Afterwards the return page is still what
 * saves a student from a locked project while a webhook is retrying.
 *
 * Both callers can therefore run this for the same reference, possibly at the
 * same moment. That is fine and is the design: the unique index on
 * `externalId` decides, and the loser reports `already` rather than granting a
 * second pass.
 *
 * What is NOT in here is the signature check. That belongs to the webhook
 * alone, because only the webhook has an untrusted body to check. This function
 * trusts a reference no further than Paystack's own answer about it.
 */

export type GrantOutcome =
  /** A pass now exists for this reference. */
  | { status: "granted"; projectId: string | null }
  /** A pass already existed for it. Not an error — retries land here. */
  | { status: "already"; projectId: string | null }
  /** Paid for, but the money has not landed yet. Worth asking again shortly. */
  | { status: "pending" }
  /**
   * The checkout was left without completing.
   *
   * Separate from `failed` because it is not final in the way a declined card
   * is. Paystack marks a transaction abandoned when the page is closed, and a
   * bank transfer sent afterwards still settles it — as a fresh
   * `charge.success`, which is why the webhook treats this as done and the
   * return page treats it as "not seen yet".
   */
  | { status: "abandoned" }
  /** Will not become a pass: declined, underpaid, or unattributable. */
  | { status: "failed"; reason: string };

/**
 * Paystack transaction states where the money is genuinely still in flight.
 *
 * `abandoned` is deliberately not here. It reports as its own outcome, because
 * the two callers need opposite things from it.
 */
const IN_FLIGHT = new Set(["pending", "ongoing", "queued"]);

export async function grantPassForReference(reference: string): Promise<GrantOutcome> {
  // The cheap path. The unique index below is the real guard; this only avoids
  // an API call on the retries that make up most repeat traffic.
  const existing = await prisma.projectPass.findUnique({
    where: { externalId: reference },
    select: { projectId: true },
  });
  if (existing) return { status: "already", projectId: existing.projectId };

  const transaction = await verifyTransaction(reference);

  if (transaction.status !== "success") {
    if (IN_FLIGHT.has(transaction.status)) return { status: "pending" };
    if (transaction.status === "abandoned") return { status: "abandoned" };
    return { status: "failed", reason: `transaction ${transaction.status}` };
  }

  /*
   * What was actually paid, against what we actually charge.
   *
   * `>=` rather than `===` so a price cut does not reject transactions opened
   * at the old price. The currency has to match exactly: 2,500,000 of some
   * other unit is not ₦25,000, and this is the check that stops a transaction
   * opened in a cheaper currency from buying a pass.
   */
  if (transaction.amountKobo < PASS_PRICE_KOBO || transaction.currency !== PASS_CURRENCY) {
    console.error(
      `[paystack] underpaid or wrong currency for ${reference}: ` +
        `${transaction.amountKobo} ${transaction.currency}`,
    );
    return { status: "failed", reason: "amount does not match" };
  }

  const userId =
    typeof transaction.metadata.userId === "string" ? transaction.metadata.userId : null;
  const projectId =
    typeof transaction.metadata.projectId === "string" ? transaction.metadata.projectId : null;

  // The metadata was written by this server when the transaction was opened,
  // so it is ours — but the account may have been deleted since.
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    : null;
  if (!user) {
    console.error(`[paystack] paid transaction ${reference} has no resolvable user`);
    return { status: "failed", reason: "no such user" };
  }

  return recordPass({
    userId: user.id,
    projectId,
    reference,
    amountKobo: transaction.amountKobo,
    currency: transaction.currency,
  });
}

/**
 * Records the pass, and spends it where the payment said to.
 *
 * Claimed here rather than left for the student when the transaction named a
 * project: they paid from that project's page, so making them come back and
 * press a second button would be asking them to finish a job they thought was
 * done. A payment that named no project leaves the pass unclaimed.
 *
 * The unique index on `externalId` is what makes a retried grant harmless —
 * the second insert loses rather than granting a second pass.
 */
async function recordPass(input: {
  userId: string;
  projectId: string | null;
  reference: string;
  amountKobo: number;
  currency: string;
}): Promise<GrantOutcome> {
  // Only onto a project they own that has no pass already; anything else and
  // the pass is still created, just unclaimed.
  const claimable = input.projectId
    ? await prisma.project.findFirst({
        where: { id: input.projectId, userId: input.userId, pass: null },
        select: { id: true },
      })
    : null;

  try {
    await prisma.projectPass.create({
      data: {
        userId: input.userId,
        projectId: claimable?.id ?? null,
        claimedAt: claimable ? new Date() : null,
        amountMinor: input.amountKobo,
        currency: input.currency,
        provider: "paystack",
        externalId: input.reference,
      },
    });
  } catch (error) {
    // P2002: the unique index caught a duplicate that slipped past the check
    // above — the webhook and the return page arriving together. Exactly what
    // it is there for.
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const winner = await prisma.projectPass.findUnique({
        where: { externalId: input.reference },
        select: { projectId: true },
      });
      return { status: "already", projectId: winner?.projectId ?? null };
    }
    throw error;
  }

  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: "pass.purchased",
      targetType: "user",
      targetId: input.userId,
      metadata: {
        reference: input.reference,
        amountMinor: input.amountKobo,
        currency: input.currency,
        projectId: claimable?.id ?? null,
      },
    },
  });

  return { status: "granted", projectId: claimable?.id ?? null };
}
