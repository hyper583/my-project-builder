import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import { PASS_PRICE_KOBO } from "@/config/plans";

/**
 * Turning a reference into a pass.
 *
 * This is reached two ways — Paystack's webhook, and the page the student lands
 * on when they come back — so the property that matters most is that running it
 * twice grants once. On a development machine the webhook cannot reach us at
 * all, which makes the return page the only path that works, and in production
 * the two genuinely race.
 *
 * `verifyTransaction` is stubbed because it is an outbound call. Nothing else
 * is: the amount check, the currency check and the unique index are all real
 * here, because they are the things that decide whether money becomes an
 * entitlement.
 */

const verifyTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/payments/paystack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/payments/paystack")>();
  return { ...actual, verifyTransaction };
});

const { grantPassForReference } = await import("@/server/services/payments/grant");

function paid(
  overrides: Partial<{
    amountKobo: number;
    currency: string;
    status: string;
    metadata: Record<string, unknown>;
  }> = {},
) {
  return {
    status: overrides.status ?? "success",
    amountKobo: overrides.amountKobo ?? PASS_PRICE_KOBO,
    currency: overrides.currency ?? "NGN",
    email: "student@example.test",
    metadata: overrides.metadata ?? {},
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

describe("granting", () => {
  it("creates a pass and spends it on the project the payment named", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    verifyTransaction.mockResolvedValue(
      paid({ metadata: { userId: user.id, projectId: project.id } }),
    );

    const outcome = await grantPassForReference("mpb_ref_a");

    expect(outcome).toEqual({ status: "granted", projectId: project.id });
    const pass = await db.projectPass.findUniqueOrThrow({
      where: { externalId: "mpb_ref_a" },
    });
    expect(pass.projectId).toBe(project.id);
    expect(pass.claimedAt).not.toBeNull();
    expect(pass.amountMinor).toBe(PASS_PRICE_KOBO);
  });

  it("leaves a pass unclaimed when no project was named", async () => {
    // Bought from Settings. Nothing has said which project it is for, and
    // guessing would spend it on one the student may abandon.
    const user = await createUser();
    verifyTransaction.mockResolvedValue(paid({ metadata: { userId: user.id } }));

    const outcome = await grantPassForReference("mpb_ref_b");

    expect(outcome).toEqual({ status: "granted", projectId: null });
    const pass = await db.projectPass.findUniqueOrThrow({
      where: { externalId: "mpb_ref_b" },
    });
    expect(pass.claimedAt).toBeNull();
  });

  it("records an audit row for the purchase", async () => {
    const user = await createUser();
    verifyTransaction.mockResolvedValue(paid({ metadata: { userId: user.id } }));

    await grantPassForReference("mpb_ref_c");

    const log = await db.auditLog.findFirstOrThrow({ where: { action: "pass.purchased" } });
    expect(log.userId).toBe(user.id);
  });
});

describe("running it twice", () => {
  it("grants once when called again with the same reference", async () => {
    // The webhook and the return page both act on one payment. This is the
    // normal case, not an edge case.
    const user = await createUser();
    const project = await createProject(user.id);
    verifyTransaction.mockResolvedValue(
      paid({ metadata: { userId: user.id, projectId: project.id } }),
    );

    const first = await grantPassForReference("mpb_ref_d");
    const second = await grantPassForReference("mpb_ref_d");

    expect(first.status).toBe("granted");
    expect(second).toEqual({ status: "already", projectId: project.id });
    expect(await db.projectPass.count()).toBe(1);
  });

  it("grants once when both callers arrive together", async () => {
    /*
     * The cheap "already recorded?" read cannot catch this — both callers pass
     * it before either writes. The unique index on externalId is what actually
     * decides, and the loser must report `already` rather than throwing a
     * database error at a student who has paid.
     */
    const user = await createUser();
    verifyTransaction.mockResolvedValue(paid({ metadata: { userId: user.id } }));

    const outcomes = await Promise.all([
      grantPassForReference("mpb_ref_e"),
      grantPassForReference("mpb_ref_e"),
    ]);

    expect(outcomes.map((o) => o.status).sort()).toEqual(["already", "granted"]);
    expect(await db.projectPass.count()).toBe(1);
  });

  it("does not spend a second pass on a project that already has one", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    verifyTransaction.mockResolvedValue(
      paid({ metadata: { userId: user.id, projectId: project.id } }),
    );
    await grantPassForReference("mpb_ref_f");

    // A second, genuinely different payment naming the same project.
    const outcome = await grantPassForReference("mpb_ref_g");

    expect(outcome).toEqual({ status: "granted", projectId: null });
    expect(await db.projectPass.count({ where: { projectId: project.id } })).toBe(1);
  });
});

describe("what it refuses", () => {
  it("grants nothing when less than the price was paid", async () => {
    const user = await createUser();
    verifyTransaction.mockResolvedValue(
      paid({ amountKobo: PASS_PRICE_KOBO - 1, metadata: { userId: user.id } }),
    );

    const outcome = await grantPassForReference("mpb_ref_h");

    expect(outcome).toMatchObject({ status: "failed" });
    expect(await db.projectPass.count()).toBe(0);
  });

  it("grants nothing when the money was a different currency", async () => {
    // 2,500,000 of something else is not ₦25,000.
    const user = await createUser();
    verifyTransaction.mockResolvedValue(
      paid({ currency: "GHS", metadata: { userId: user.id } }),
    );

    expect(await grantPassForReference("mpb_ref_i")).toMatchObject({ status: "failed" });
    expect(await db.projectPass.count()).toBe(0);
  });

  it("grants nothing when the payment names no resolvable user", async () => {
    verifyTransaction.mockResolvedValue(paid({ metadata: { userId: "does-not-exist" } }));

    expect(await grantPassForReference("mpb_ref_j")).toMatchObject({ status: "failed" });
    expect(await db.projectPass.count()).toBe(0);
  });

  it("does not spend a pass on someone else's project", async () => {
    // The project id comes from metadata we wrote, but ownership is still
    // checked — a pass landing on another account's project would unlock it.
    const buyer = await createUser();
    const stranger = await createUser();
    const theirs = await createProject(stranger.id);
    verifyTransaction.mockResolvedValue(
      paid({ metadata: { userId: buyer.id, projectId: theirs.id } }),
    );

    const outcome = await grantPassForReference("mpb_ref_k");

    expect(outcome).toEqual({ status: "granted", projectId: null });
    expect(await db.projectPass.count({ where: { projectId: theirs.id } })).toBe(0);
  });
});

describe("payments still in motion", () => {
  it("reports an unsettled transfer as pending rather than failed", async () => {
    const user = await createUser();
    verifyTransaction.mockResolvedValue(
      paid({ status: "ongoing", metadata: { userId: user.id } }),
    );

    expect(await grantPassForReference("mpb_ref_l")).toEqual({ status: "pending" });
    expect(await db.projectPass.count()).toBe(0);
  });

  it("reports an abandoned checkout separately from a failure", async () => {
    /*
     * Paystack marks a transaction abandoned the moment the checkout page is
     * closed — which is what a student does after starting a transfer in their
     * banking app. The webhook treats this as settled; the return page treats
     * it as not yet seen. Collapsing it into `failed` would tell someone who is
     * mid-payment that it did not work.
     */
    const user = await createUser();
    verifyTransaction.mockResolvedValue(
      paid({ status: "abandoned", metadata: { userId: user.id } }),
    );

    expect(await grantPassForReference("mpb_ref_m")).toEqual({ status: "abandoned" });
    expect(await db.projectPass.count()).toBe(0);
  });
});
