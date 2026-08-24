import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { AppError } from "@/server/errors";

/**
 * Paystack.
 *
 * Nigerian students pay by bank transfer far more than by card, which is why
 * this is Paystack rather than a card-first processor and why the product sells
 * one-time passes rather than subscriptions — recurring billing needs a
 * tokenised card, and a subscription re-collected by hand every month is a
 * one-time payment with worse conversion and more code.
 *
 * Two rules hold everywhere in this file:
 *
 * 1. The secret key never leaves the server. It both authenticates API calls
 *    and signs webhooks, so a leak is not "someone can read your transactions"
 *    — it is "someone can forge a payment".
 *
 * 2. Nothing a caller sends is trusted about money. The webhook payload is a
 *    hint that something happened; the amount that decides whether a pass is
 *    granted comes from asking Paystack directly.
 */

const API = "https://api.paystack.co";

/** The header Paystack signs its webhooks with. */
export const SIGNATURE_HEADER = "x-paystack-signature";

function secretKey(): string {
  const key = env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new AppError("INTERNAL", { message: "PAYSTACK_SECRET_KEY is not configured" });
  }
  return key;
}

/**
 * Whether a webhook body really came from Paystack.
 *
 * HMAC-SHA512 of the RAW body, keyed with the secret key. Raw matters: parsing
 * the JSON and re-serialising it produces different bytes — key order, unicode
 * escaping, whitespace — and the signature will not match. Every caller must
 * hand this the untouched request text.
 *
 * Compared in constant time. A `===` on a hex digest leaks, through timing, how
 * many leading characters a guess got right, which turns forging a signature
 * into a few thousand requests rather than a brute force of the key.
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", secretKey()).update(rawBody, "utf8").digest("hex");

  // timingSafeEqual throws on a length mismatch, and the lengths are not
  // secret — a hex SHA-512 is always 128 characters.
  if (signature.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
}

/** A reference of our own, so a transaction can be traced back from either side. */
export function newReference(): string {
  return `mpb_${randomUUID().replace(/-/g, "")}`;
}

export interface InitialisedTransaction {
  readonly authorizationUrl: string;
  readonly reference: string;
}

/**
 * Opens a transaction and returns where to send the student.
 *
 * The amount is set HERE, on the server, and never taken from the browser. A
 * client-supplied price is a price the client can change.
 */
export async function initialiseTransaction(options: {
  email: string;
  amountKobo: number;
  currency: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}): Promise<InitialisedTransaction> {
  const reference = newReference();

  const response = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: options.email,
      amount: options.amountKobo,
      currency: options.currency,
      reference,
      callback_url: options.callbackUrl,
      metadata: options.metadata,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  } | null;

  if (!response.ok || !payload?.status || !payload.data?.authorization_url) {
    throw new AppError("INTERNAL", {
      message: `Paystack initialise failed (${response.status}): ${payload?.message ?? "no body"}`,
      userMessage: "Payment could not be started just now. Please try again in a moment.",
    });
  }

  return { authorizationUrl: payload.data.authorization_url, reference };
}

export interface VerifiedTransaction {
  readonly status: string;
  readonly amountKobo: number;
  readonly currency: string;
  readonly email: string | null;
  readonly metadata: Record<string, unknown>;
}

/**
 * Asks Paystack what actually happened.
 *
 * `status: true` on the envelope only means the API call worked. Whether money
 * moved is `data.status`, and the two are easy to confuse — which is why this
 * returns the inner one and the caller has no access to the outer.
 *
 * Idempotent, so a retry after a network failure is safe.
 */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const response = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });

  const payload = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      amount?: number;
      currency?: string;
      customer?: { email?: string };
      metadata?: Record<string, unknown> | string;
    };
  } | null;

  if (!response.ok || !payload?.status || !payload.data) {
    throw new AppError("INTERNAL", {
      message: `Paystack verify failed (${response.status}): ${payload?.message ?? "no body"}`,
    });
  }

  // Paystack returns metadata as an object, but as a JSON *string* when it was
  // sent as one. Normalised here so callers never have to guess.
  const raw = payload.data.metadata;
  let metadata: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      metadata = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  } else if (raw && typeof raw === "object") {
    metadata = raw;
  }

  return {
    status: String(payload.data.status ?? "unknown"),
    amountKobo: Number(payload.data.amount ?? 0),
    currency: String(payload.data.currency ?? ""),
    email: payload.data.customer?.email ?? null,
    metadata,
  };
}
