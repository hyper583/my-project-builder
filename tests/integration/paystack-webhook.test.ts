import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import { PASS_PRICE_KOBO } from "@/config/plans";

/**
 * The webhook that turns money into an entitlement.
 *
 * The only endpoint in the application that grants something of value to an
 * unauthenticated caller, so these tests are mostly about what it REFUSES.
 *
 * `verifyTransaction` is stubbed — it is an outbound call to Paystack — but
 * `verifySignature` is deliberately left real. Stubbing the signature check
 * would leave the security boundary untested while making every test pass,
 * which is the worst possible combination.
 */

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

const verifyTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/payments/paystack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/payments/paystack")>();
  return { ...actual, verifyTransaction };
});

const { POST } = await import("@/app/api/webhooks/paystack/route");

function post(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  return POST(
    new Request("https://example.test/api/webhooks/paystack", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "x-paystack-signature":
          signature ?? createHmac("sha512", SECRET).update(raw, "utf8").digest("hex"),
      },
    }),
  );
}

const chargeSuccess = (reference = "mpb_ref_1") => ({
  event: "charge.success",
  data: { reference },
});

function paid(overrides: Partial<{ amountKobo: number; currency: string; status: string }> = {}) {
  return {
    status: overrides.status ?? "success",
    amountKobo: overrides.amountKobo ?? PASS_PRICE_KOBO,
    currency: overrides.currency ?? "NGN",
    email: "student@example.test",
    metadata: {} as Record<string, unknown>,
  };
}

beforeEach(async () => {
  await resetDatabase();
  verifyTransaction.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("what it refuses", () => {
  it("rejects an unsigned request without asking Paystack anything", async () => {
    const response = await post(chargeSuccess(), "not-a-signature");

    expect(response.status).toBe(401);
    expect(verifyTransaction).not.toHaveBeenCalled();
    expect(await db.projectPass.count()).toBe(0);
  });

  it("rejects a payload edited after it was signed", async () => {
    // A real signed event with the reference swapped for another one.
    const raw = JSON.stringify(chargeSuccess("mpb_original"));
    const signature = createHmac("sha512", SECRET).update(raw, "utf8").digest("hex");

    const response = await post(chargeSuccess("mpb_swapped"), signature);

    expect(response.status).toBe(401);
    expect(await db.projectPass.count()).toBe(0);
  });

  it("grants nothing when the transaction did not succeed", async () => {
    const user = await createUser();
    verifyTransaction.mockResolvedValue({
      ...paid({ status: "abandoned" }),
      metadata: { userId: user.id },
    });

    const response = await post(chargeSuccess());

    // 200, not an error: an abandoned payment is a normal outcome and Paystack
    // should stop retrying it.
    expect(response.status).toBe(200);
    expect(await db.projectPass.count()).toBe(0);
  });

  it("grants nothing when less than the price was paid", async () => {
    /*
     * The attack this closes. A signed `charge.success` proves Paystack sent
     * the event; it proves nothing about the amount. Someone who opens a ₦100
     * transaction produces exactly the same event shape as someone who paid
     * ₦25,000, which is why the amount is read back from Paystack and checked
     * here rather than taken from the payload.
     */
    const user = await createUser();
    verifyTransaction.mockResolvedValue({
      ...paid({ amountKobo: 10_000 }),
      metadata: { userId: user.id },
    });

    const response = await post(chargeSuccess());

    expect(response.status).toBe(200);
    expect(await db.projectPass.count()).toBe(0);
  });

  it("grants nothing when the currency is not the one we price in", async () => {
    // 2,500,000 of something else is not ₦25,000.
    const user = await createUser();
    verifyTransaction.mockResolvedValue({
      ...paid({ currency: "GHS" }),
      metadata: { userId: user.id },
    });

    await post(chargeSuccess());
    expect(await db.projectPass.count()).toBe(0);
  });

  it("grants nothing when the payment names no account we know", async () => {
    verifyTransaction.mockResolvedValue({ ...paid(), metadata: { userId: "deleted-user" } });

    const response = await post(chargeSuccess());

    expect(response.status).toBe(200);
    expect(await db.projectPass.count()).toBe(0);
  });

  it("acknowledges events it does not handle rather than failing them", async () => {
    // Paystack retries non-2xx for hours. An event we have chosen to ignore is
    // not something it should keep asking about.
    const response = await post({ event: "transfer.failed", data: { reference: "x" } });

    expect(response.status).toBe(200);
    expect(verifyTransaction).not.toHaveBeenCalled();
  });
});

describe("what it grants", () => {
  it("records a pass for a payment that checks out", async () => {
    const user = await createUser();
    verifyTransaction.mockResolvedValue({ ...paid(), metadata: { userId: user.id } });

    const response = await post(chargeSuccess("mpb_good"));

    expect(response.status).toBe(200);
    const pass = await db.projectPass.findFirstOrThrow({ where: { userId: user.id } });
    expect(pass.provider).toBe("paystack");
    expect(pass.externalId).toBe("mpb_good");
    expect(pass.amountMinor).toBe(PASS_PRICE_KOBO);
    // No project named, so it waits to be spent.
    expect(pass.claimedAt).toBeNull();
  });

  it("spends the pass on the project the payment was started from", async () => {
    // They paid from that project's page; making them come back and press a
    // second button would be asking them to finish a job they thought was done.
    const user = await createUser();
    const project = await createProject(user.id);
    verifyTransaction.mockResolvedValue({
      ...paid(),
      metadata: { userId: user.id, projectId: project.id },
    });

    await post(chargeSuccess("mpb_claimed"));

    const pass = await db.projectPass.findFirstOrThrow({ where: { userId: user.id } });
    expect(pass.projectId).toBe(project.id);
    expect(pass.claimedAt).not.toBeNull();
  });

  it("will not spend a pass on someone else's project", async () => {
    const buyer = await createUser();
    const stranger = await createUser();
    const theirs = await createProject(stranger.id);
    verifyTransaction.mockResolvedValue({
      ...paid(),
      metadata: { userId: buyer.id, projectId: theirs.id },
    });

    await post(chargeSuccess("mpb_wrong_owner"));

    const pass = await db.projectPass.findFirstOrThrow({ where: { userId: buyer.id } });
    // Still granted — they paid — but not spent on a project they do not own.
    expect(pass.projectId).toBeNull();
    expect(pass.claimedAt).toBeNull();
  });

  it("grants exactly one pass however many times the webhook is retried", async () => {
    /*
     * Paystack retries until it gets a 2xx, and a retry that granted a second
     * pass would hand out free projects to anyone who could make the first
     * response time out.
     */
    const user = await createUser();
    verifyTransaction.mockResolvedValue({ ...paid(), metadata: { userId: user.id } });

    for (let i = 0; i < 3; i += 1) await post(chargeSuccess("mpb_retried"));

    expect(await db.projectPass.count()).toBe(1);
  });

  it("grants one pass when two retries arrive at the same instant", async () => {
    // The check-then-insert above has a race in it; the unique index on
    // externalId is what actually closes it.
    const user = await createUser();
    verifyTransaction.mockResolvedValue({ ...paid(), metadata: { userId: user.id } });

    const responses = await Promise.all([
      post(chargeSuccess("mpb_race")),
      post(chargeSuccess("mpb_race")),
    ]);

    for (const response of responses) expect(response.status).toBe(200);
    expect(await db.projectPass.count()).toBe(1);
  });

  it("records the purchase in the audit log", async () => {
    const user = await createUser();
    verifyTransaction.mockResolvedValue({ ...paid(), metadata: { userId: user.id } });

    await post(chargeSuccess("mpb_audited"));

    const entry = await db.auditLog.findFirstOrThrow({ where: { action: "pass.purchased" } });
    expect((entry.metadata as { reference?: string }).reference).toBe("mpb_audited");
  });
});
