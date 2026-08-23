import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db, resetDatabase } from "./helpers";

/**
 * Administering people.
 *
 * Weighted almost entirely towards refusals. The happy paths here are one-line
 * column updates; the ways this goes wrong are the ways an organisation locks
 * itself out of its own product, and there is no self-service route back —
 * ADMIN_BOOTSTRAP_EMAIL only promotes on user CREATION, so a demoted admin
 * cannot be restored by restarting with the variable set. It would take a
 * hand-written database edit.
 */

const actor = { id: "", email: "", name: "", role: "ADMIN" as const, planTier: "FREE" as const };

vi.mock("@/server/dal/session", () => ({
  requireUser: async () => actor,
  requireSession: async () => actor,
  requireAdmin: async () => {
    if (actor.role !== "ADMIN") throw new Error("NOT_FOUND");
    return actor;
  },
}));

// `revalidatePath` needs a Next request context vitest does not provide.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { setUserPlan, setUserRole, setUserSuspended } = await import("@/server/actions/admin");

let counter = 0;
async function makeUser(overrides: Partial<{ role: "STUDENT" | "ADMIN"; planTier: "FREE" | "PAID" }> = {}) {
  counter += 1;
  return db.user.create({
    data: {
      name: `Person ${counter}`,
      email: `person-${counter}-${Date.now()}@example.com`,
      role: overrides.role ?? "STUDENT",
      planTier: overrides.planTier ?? "FREE",
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  const admin = await makeUser({ role: "ADMIN" });
  Object.assign(actor, { id: admin.id, email: admin.email, name: admin.name, role: "ADMIN" });
  // A second admin, so the "last admin" rule is not tripped by the actor alone
  // in tests that are about something else.
  await makeUser({ role: "ADMIN" });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("suspension", () => {
  it("suspends and restores", async () => {
    const target = await makeUser();

    expect((await setUserSuspended({ userId: target.id, suspended: true })).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).not.toBeNull();

    expect((await setUserSuspended({ userId: target.id, suspended: false })).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).toBeNull();
  });

  it("refuses to suspend yourself", async () => {
    // Almost always a misclick, and the recovery is a database edit.
    const result = await setUserSuspended({ userId: actor.id, suspended: true });

    expect(result.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: actor.id } })).suspendedAt).toBeNull();
  });

  it("refuses to suspend the last active admin", async () => {
    // Demote the spare so only one active admin besides the actor remains,
    // then suspend that one — which would leave the actor as the only admin,
    // which is allowed. The refusal is about the LAST one.
    const others = await db.user.findMany({ where: { role: "ADMIN", id: { not: actor.id } } });
    const spare = others[0]!;

    // Make the actor a student so `spare` is genuinely the only active admin.
    await db.user.update({ where: { id: actor.id }, data: { role: "STUDENT" } });
    actor.role = "ADMIN"; // the mock still authorises; the DB state is what matters

    const result = await setUserSuspended({ userId: spare.id, suspended: true });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/only active admin/i);
    expect((await db.user.findUniqueOrThrow({ where: { id: spare.id } })).suspendedAt).toBeNull();
  });
});

describe("roles", () => {
  it("promotes and demotes", async () => {
    const target = await makeUser();

    expect((await setUserRole({ userId: target.id, role: "ADMIN" })).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("ADMIN");

    expect((await setUserRole({ userId: target.id, role: "STUDENT" })).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("STUDENT");
  });

  it("refuses to change your own role", async () => {
    const result = await setUserRole({ userId: actor.id, role: "STUDENT" });

    expect(result.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: actor.id } })).role).toBe("ADMIN");
  });

  it("refuses to demote the last active admin", async () => {
    const spare = (await db.user.findMany({ where: { role: "ADMIN", id: { not: actor.id } } }))[0]!;
    await db.user.update({ where: { id: actor.id }, data: { role: "STUDENT" } });

    const result = await setUserRole({ userId: spare.id, role: "STUDENT" });

    expect(result.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: spare.id } })).role).toBe("ADMIN");
  });

  it("counts a suspended admin as not active", async () => {
    // A suspended admin cannot sign in, so they are not a way back into the
    // product. Treating them as an active admin would let the real one be
    // demoted and lock everyone out.
    const spare = (await db.user.findMany({ where: { role: "ADMIN", id: { not: actor.id } } }))[0]!;
    await db.user.update({ where: { id: spare.id }, data: { suspendedAt: new Date() } });

    const target = await makeUser({ role: "ADMIN" });
    await db.user.update({ where: { id: actor.id }, data: { role: "STUDENT" } });

    // `target` is now the only ACTIVE admin, so demoting it must be refused.
    const result = await setUserRole({ userId: target.id, role: "STUDENT" });
    expect(result.ok).toBe(false);
  });
});

describe("plans", () => {
  it("moves a user between tiers", async () => {
    const target = await makeUser();

    expect((await setUserPlan({ userId: target.id, planTier: "PAID" })).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).planTier).toBe("PAID");
  });

  it("does not fabricate a payment record", async () => {
    const target = await makeUser();
    await setUserPlan({ userId: target.id, planTier: "PAID" });

    // Subscription reflects what a payment provider believes. A comped account
    // is an override of the tier, not evidence that money changed hands.
    expect(await db.subscription.count({ where: { userId: target.id } })).toBe(0);
  });

  it("refuses to change your own plan", async () => {
    const result = await setUserPlan({ userId: actor.id, planTier: "PAID" });
    expect(result.ok).toBe(false);
  });
});

describe("the audit trail", () => {
  it("records every change against the admin who made it", async () => {
    const target = await makeUser();

    await setUserSuspended({ userId: target.id, suspended: true });
    await setUserRole({ userId: target.id, role: "ADMIN" });
    await setUserPlan({ userId: target.id, planTier: "PAID" });

    const entries = await db.auditLog.findMany({
      where: { targetId: target.id },
      orderBy: { createdAt: "asc" },
    });

    expect(entries.map((e) => e.action)).toEqual([
      "admin.user.suspend",
      "admin.user.role",
      "admin.user.plan",
    ]);
    for (const entry of entries) expect(entry.userId).toBe(actor.id);
  });

  it("records what a value changed from, not only that it changed", async () => {
    const target = await makeUser({ planTier: "FREE" });
    await setUserPlan({ userId: target.id, planTier: "PAID" });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { targetId: target.id, action: "admin.user.plan" },
    });

    // "Who made this account paid, and from what" is the question asked later.
    expect(entry.metadata).toMatchObject({ from: "FREE", to: "PAID" });
  });

  it("keeps the subject's email, so the trail survives their deletion", async () => {
    const target = await makeUser();
    await setUserSuspended({ userId: target.id, suspended: true });

    const entry = await db.auditLog.findFirstOrThrow({ where: { targetId: target.id } });
    expect(entry.metadata).toMatchObject({ subjectEmail: target.email });
  });

  it("writes nothing when an action is refused", async () => {
    await setUserRole({ userId: actor.id, role: "STUDENT" });

    // A refusal is not an event. Logging attempts here would make the trail
    // noisy in exactly the situation someone reads it carefully.
    expect(await db.auditLog.count({ where: { targetId: actor.id } })).toBe(0);
  });
});
