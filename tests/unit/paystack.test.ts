import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { SIGNATURE_HEADER, newReference, verifySignature } from "@/server/services/payments/paystack";

/**
 * The webhook's signature check.
 *
 * This is the whole security boundary of the one endpoint that grants
 * something of value to an unauthenticated caller. Everything else in the
 * payment path — asking Paystack what happened, checking the amount — runs
 * only after this returns true, so a hole here is a hole in all of it.
 *
 * `tests/setup.ts` sets PAYSTACK_SECRET_KEY for the suite; the value below
 * must match it.
 */

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

function sign(body: string, key = SECRET): string {
  return createHmac("sha512", key).update(body, "utf8").digest("hex");
}

const BODY = JSON.stringify({
  event: "charge.success",
  data: { reference: "mpb_test", amount: 2_500_000, currency: "NGN" },
});

describe("verifySignature", () => {
  it("accepts a body Paystack actually signed", () => {
    expect(verifySignature(BODY, sign(BODY))).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    // The attack it exists to stop: a real signed payload with the amount
    // edited upward, or the user id swapped for someone else's.
    const tampered = BODY.replace("2500000", "100");
    expect(verifySignature(tampered, sign(BODY))).toBe(false);
  });

  it("rejects a signature made with a different key", () => {
    expect(verifySignature(BODY, sign(BODY, "sk_test_someone_elses_key"))).toBe(false);
  });

  it("rejects a missing signature outright", () => {
    expect(verifySignature(BODY, null)).toBe(false);
    expect(verifySignature(BODY, "")).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // `timingSafeEqual` throws when the buffers differ in length, so the check
    // has to happen first — otherwise a one-character signature crashes the
    // route instead of being refused.
    expect(() => verifySignature(BODY, "abc")).not.toThrow();
    expect(verifySignature(BODY, "abc")).toBe(false);
  });

  it("is sensitive to whitespace, because the raw body is what is signed", () => {
    /*
     * The mistake this guards against is reading the request as JSON and
     * re-serialising it before checking. Key order, unicode escaping and
     * spacing all change the bytes, and the signature stops matching — which
     * presents as "Paystack's webhooks are all invalid" rather than as a bug
     * in our own code.
     */
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(reserialised).not.toBe(BODY);
    expect(verifySignature(reserialised, sign(BODY))).toBe(false);
  });

  it("uses SHA-512, not SHA-256", () => {
    // A hex SHA-512 is 128 characters. The wrong algorithm is the single most
    // common Paystack integration error and it fails closed, silently.
    expect(sign(BODY)).toHaveLength(128);
    const sha256 = createHmac("sha256", SECRET).update(BODY, "utf8").digest("hex");
    expect(verifySignature(BODY, sha256)).toBe(false);
  });
});

describe("newReference", () => {
  it("is unique per call and recognisably ours", () => {
    const references = new Set(Array.from({ length: 200 }, () => newReference()));
    expect(references.size).toBe(200);
    for (const reference of references) expect(reference.startsWith("mpb_")).toBe(true);
  });

  it("carries nothing that has to stay secret", () => {
    // The reference travels through Paystack's dashboard and the student's
    // browser, so it must not encode a user id or anything else identifying.
    expect(newReference()).toMatch(/^mpb_[0-9a-f]{32}$/);
  });
});

describe("the signature header", () => {
  it("is the one Paystack actually sends", () => {
    // Lower-case: Headers.get is case-insensitive, but the constant is used in
    // tests and docs too, and the wrong name fails closed and silently.
    expect(SIGNATURE_HEADER).toBe("x-paystack-signature");
  });
});
