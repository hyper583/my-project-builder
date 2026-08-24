import { isPaystackConfigured } from "@/lib/env";
import { grantPassForReference } from "@/server/services/payments/grant";
import { SIGNATURE_HEADER, verifySignature } from "@/server/services/payments/paystack";

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
 * Steps 2 to 4 live in `grantPassForReference`, which the payment return page
 * also calls — one path to a pass, so the two cannot disagree about what counts
 * as paid. Step 1 stays here, because only this route has an untrusted body.
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
    const outcome = await grantPassForReference(reference);

    /*
     * `charge.success` arrived, but verify says the money is still moving.
     *
     * A race rather than a contradiction: the event can reach us marginally
     * before the transaction endpoint reports the same thing. This is the one
     * outcome where Paystack's retry is worth having, so it must be a non-2xx —
     * a 202 reads as "accepted" and is never retried, which would strand a
     * student who really had paid.
     *
     * An ABANDONED transaction is not this case and returns 200 below. It is a
     * normal ending, and if the student later sends the transfer anyway,
     * Paystack settles it and sends a whole new `charge.success` — so retrying
     * this one for hours would achieve nothing but noise.
     */
    if (outcome.status === "pending") {
      return new Response("Not settled yet", { status: 503 });
    }

    return new Response(outcome.status, { status: 200 });
  } catch (error) {
    // A real fault — the database, or Paystack being unreachable. 500 so the
    // retry does something useful, because the student has paid and is waiting.
    console.error("[paystack] webhook failed", error);
    return new Response("Failed", { status: 500 });
  }
}
