import { PASS_CURRENCY, PASS_PRICE_KOBO } from "@/config/plans";
import { isPaystackConfigured } from "@/lib/env";
import { prisma } from "@/server/db";
import {
  SIGNATURE_HEADER,
  verifySignature,
  verifyTransaction,
} from "@/server/services/payments/paystack";

/**
 * Paystack's webhook.
 *
 * The one endpoint in this application that grants something of value to an
 * unauthenticated caller, so the order of checks below is the security model:
 *
 *   1. Signature, over the RAW body, in constant time. Nothing else runs first.
 *   2. Ask Paystack what happened, rather than believing the payload.
 *   3. Check the amount and currency against our own price.
 *   4. Create the pass idempotently.
 *
 * Steps 2 and 3 are not belt-and-braces. A signed webhook only proves Paystack
 * sent it — it does not prove the transaction succeeded, and it certainly does
 * not prove what was paid. A student who opened a ₦100 transaction and one who
 * paid ₦25,000 both produce a signed `charge.success`.
 *
 * After the signature passes this returns 200 to almost everything. Paystack
 * retries non-2xx for hours, and a payment we have chosen not to act on — a
 * duplicate, an event we do not handle — is not a failure it should keep
 * asking about. Genuine faults return 500 so the retry is useful.
 */

/** Node runtime, not edge: signature verification uses node:crypto. */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  // Unconfigured, this endpoint has nothing to check a signature against, so it
  // must refuse rather than fall through to logic that grants passes.
  if (!isPaystackConfigured) {
    return new Response("Not configured", { status: 503 });
  }

  // The RAW text. Reading it as JSON and re-serialising changes the bytes and
  // the signature will never match.
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get(SIGNATURE_HEADER))) {
    // Deliberately terse and identical for every rejection: a caller probing
    // this endpoint learns nothing about why they failed.
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return new Response("Malformed body", { status: 400 });
  }

  // Paystack sends many event types. Everything else is acknowledged so it is
  // not retried, and ignored.
  if (event.event !== "charge.success") {
    return new Response("Ignored", { status: 200 });
  }

  const reference = event.data?.reference;
  if (!reference) return new Response("No reference", { status: 200 });

  try {
    // Already granted? Paystack retries, and the unique index on externalId is
    // the real guard — this is the cheap path that avoids a pointless API call.
    const existing = await prisma.projectPass.findUnique({
      where: { externalId: reference },
      select: { id: true },
    });
    if (existing) return new Response("Already recorded", { status: 200 });

    const transaction = await verifyTransaction(reference);

    if (transaction.status !== "success") {
      // An abandoned or failed transaction is a normal outcome, not an error.
      return new Response("Not a successful transaction", { status: 200 });
    }

    // What was actually paid, against what we actually charge. `>=` rather than
    // `===` so a price cut does not reject transactions opened at the old one.
    if (transaction.amountKobo < PASS_PRICE_KOBO || transaction.currency !== PASS_CURRENCY) {
      console.error(
        `[paystack] underpaid or wrong currency for ${reference}: ` +
          `${transaction.amountKobo} ${transaction.currency}`,
      );
      return new Response("Amount does not match", { status: 200 });
    }

    const userId = typeof transaction.metadata.userId === "string"
      ? transaction.metadata.userId
      : null;
    const projectId = typeof transaction.metadata.projectId === "string"
      ? transaction.metadata.projectId
      : null;

    // The metadata was written by this server when the transaction was opened,
    // so it is ours — but the account may have been deleted since.
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      : null;
    if (!user) {
      console.error(`[paystack] paid transaction ${reference} has no resolvable user`);
      return new Response("No such user", { status: 200 });
    }

    await grantPass({
      userId: user.id,
      projectId,
      reference,
      amountKobo: transaction.amountKobo,
      currency: transaction.currency,
    });

    return new Response("Recorded", { status: 200 });
  } catch (error) {
    // A real fault — the database, or Paystack being unreachable. 500 so the
    // retry does something useful, because the student has paid and is waiting.
    console.error("[paystack] webhook failed", error);
    return new Response("Failed", { status: 500 });
  }
}

/**
 * Records the pass, and spends it where the payment said to.
 *
 * Claimed here rather than left for the student when the transaction named a
 * project: they paid from that project's page, so making them come back and
 * press a second button would be asking them to finish a job they thought was
 * done. A payment that named no project leaves the pass unclaimed.
 *
 * The unique index on `externalId` is what makes a retried webhook harmless —
 * the second insert loses rather than granting a second pass.
 */
async function grantPass(input: {
  userId: string;
  projectId: string | null;
  reference: string;
  amountKobo: number;
  currency: string;
}): Promise<void> {
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
    // above — two retries arriving together. Exactly what it is there for.
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return;
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
}
