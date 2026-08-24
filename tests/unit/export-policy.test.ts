import { describe, expect, it } from "vitest";

import {
  assertDisclaimer,
  resolveExportPolicy,
  type ExportActor,
  type ExportTarget,
} from "@/server/services/export/policy";

/**
 * The demo export matrix.
 *
 * This is the rule the whole demo design rests on, so it is tested at the
 * server layer where it actually has to hold — not through the UI, which can
 * only ever hide a button.
 */

const freeStudent: ExportActor = { id: "user-1", role: "STUDENT", planTier: "FREE" };
const paidStudent: ExportActor = { id: "user-1", role: "STUDENT", planTier: "PAID" };
const admin: ExportActor = { id: "admin-1", role: "ADMIN", planTier: "FREE" };

const demoProject: ExportTarget = { id: "p-demo", kind: "DEMO", ownerId: "user-1", hasPass: false };
const realProject: ExportTarget = { id: "p-real", kind: "REAL", ownerId: "user-1", hasPass: true };
const unpaidProject: ExportTarget = { id: "p-unpaid", kind: "REAL", ownerId: "user-1", hasPass: false };
const someoneElses: ExportTarget = { id: "p-other", kind: "REAL", ownerId: "user-2", hasPass: true };

describe("resolveExportPolicy — demo matrix", () => {
  it("blocks a free student from exporting a demo", () => {
    const policy = resolveExportPolicy(freeStudent, demoProject);
    expect(policy.allowed).toBe(false);
    if (!policy.allowed) expect(policy.reason).toBe("DEMO_REQUIRES_PAID_PLAN");
  });

  it("allows a paid student, but always with the disclaimer", () => {
    const policy = resolveExportPolicy(paidStudent, demoProject);
    expect(policy.allowed).toBe(true);
    if (policy.allowed) {
      expect(policy.disclaimer).toBe(true);
      expect(policy.requiresAudit).toBe(false);
    }
  });

  it("allows an admin a clean export, and flags it for audit", () => {
    const policy = resolveExportPolicy(admin, demoProject);
    expect(policy.allowed).toBe(true);
    if (policy.allowed) {
      expect(policy.disclaimer).toBe(false);
      expect(policy.requiresAudit).toBe(true);
    }
  });

  it("never requires a disclaimer on a real project", () => {
    // A real project is the student's own work; nothing is stamped on it.
    for (const actor of [paidStudent, admin]) {
      const policy = resolveExportPolicy(actor, realProject);
      expect(policy.allowed).toBe(true);
      if (policy.allowed) expect(policy.disclaimer).toBe(false);
    }
  });

  it("blocks a student from downloading a project no pass was spent on", () => {
    // The paywall. The student generates the project and reads every word of
    // it in the workspace; taking it away is what is paid for.
    const policy = resolveExportPolicy(freeStudent, unpaidProject);
    expect(policy.allowed).toBe(false);
    if (!policy.allowed) expect(policy.reason).toBe("REAL_EXPORT_NOT_IN_PLAN");
  });

  it("releases the project a pass was actually spent on", () => {
    const policy = resolveExportPolicy(freeStudent, realProject);
    expect(policy.allowed).toBe(true);
  });

  it("reads the pass, not the account", () => {
    /*
     * The defect this replaced: entitlement to download was a permanent
     * property of the ACCOUNT, so one payment released every project it would
     * ever create, forever. A paid account with an unpaid project must still
     * be refused, and a free account with a paid project must still be served.
     */
    expect(resolveExportPolicy(paidStudent, unpaidProject).allowed).toBe(false);
    expect(resolveExportPolicy(freeStudent, realProject).allowed).toBe(true);
  });
});

describe("resolveExportPolicy — ownership", () => {
  it("refuses a non-admin exporting someone else's project", () => {
    const policy = resolveExportPolicy(paidStudent, someoneElses);
    expect(policy.allowed).toBe(false);
    if (!policy.allowed) expect(policy.reason).toBe("NOT_OWNER");
  });

  it("does not let ownership be bypassed by a pass", () => {
    // Even a project someone else paid for. Ownership is checked before any
    // entitlement is considered.
    const demoOfAnother: ExportTarget = {
      id: "p-x",
      kind: "DEMO",
      ownerId: "user-2",
      hasPass: true,
    };
    const policy = resolveExportPolicy(paidStudent, demoOfAnother);
    expect(policy.allowed).toBe(false);
    if (!policy.allowed) expect(policy.reason).toBe("NOT_OWNER");
  });
});

describe("assertDisclaimer — the renderer guard", () => {
  it("throws if a renderer omits a required disclaimer", () => {
    const policy = resolveExportPolicy(paidStudent, demoProject);
    expect(() => assertDisclaimer(policy, false)).toThrowError(/without its disclaimer/i);
  });

  it("passes when the renderer drew it", () => {
    const policy = resolveExportPolicy(paidStudent, demoProject);
    expect(() => assertDisclaimer(policy, true)).not.toThrow();
  });

  it("passes for an admin clean export, which needs none", () => {
    const policy = resolveExportPolicy(admin, demoProject);
    expect(() => assertDisclaimer(policy, false)).not.toThrow();
  });

  it("refuses to be called for a disallowed export", () => {
    const policy = resolveExportPolicy(freeStudent, demoProject);
    expect(() => assertDisclaimer(policy, true)).toThrowError(/was not allowed/i);
  });
});
