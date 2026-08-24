/**
 * Export policy resolution.
 *
 * This is the single place that decides (a) whether an export may proceed and
 * (b) whether it must carry the demo disclaimer. Every renderer — DOCX, PDF and
 * anything added later — consumes the result of `resolveExportPolicy` rather
 * than deciding for itself, so the rules cannot drift apart between formats.
 *
 * Matrix:
 *   Student, FREE  + DEMO project -> blocked (upgrade prompt)
 *   Student, PAID  + DEMO project -> allowed, disclaimer REQUIRED
 *   Admin          + DEMO project -> allowed, clean (audit-logged by the caller)
 *   Owner, no pass + REAL project -> blocked (the paywall)
 *   Owner, pass    + REAL project -> allowed, no disclaimer
 *   Admin          + REAL project -> allowed, no disclaimer
 *
 * Deliberately pure and synchronous. Whether the project carries a pass is
 * looked up by the caller and passed in, so this stays a function of its
 * arguments and the matrix above can be tested without a database.
 */

import { entitlementsFor, type PlanTier } from "@/config/plans";

export type UserRole = "STUDENT" | "ADMIN";
export type ProjectKind = "REAL" | "DEMO";

export interface ExportActor {
  readonly id: string;
  readonly role: UserRole;
  readonly planTier: PlanTier;
}

export interface ExportTarget {
  readonly id: string;
  readonly kind: ProjectKind;
  readonly ownerId: string;
  /**
   * Whether a project pass has been spent on this project.
   *
   * The entitlement to download belongs to the PROJECT, not the account. It
   * used to be `planTier`, which was permanent — one payment released every
   * project the account would ever create, for as long as it existed.
   */
  readonly hasPass: boolean;
}

export type ExportDenialReason =
  | "NOT_OWNER"
  | "DEMO_REQUIRES_PAID_PLAN"
  | "REAL_EXPORT_NOT_IN_PLAN";

export type ExportPolicy =
  | { readonly allowed: false; readonly reason: ExportDenialReason }
  | {
      readonly allowed: true;
      /** When true the rendered document MUST carry the full disclaimer set. */
      readonly disclaimer: boolean;
      /** True only for the admin clean-export path, which the caller must audit-log. */
      readonly requiresAudit: boolean;
    };

export function resolveExportPolicy(actor: ExportActor, target: ExportTarget): ExportPolicy {
  const isAdmin = actor.role === "ADMIN";

  // Admins may export any project. Demo exports are deliberately clean so they
  // can be used as marketing and sales collateral — and are audit-logged.
  if (isAdmin) {
    return { allowed: true, disclaimer: false, requiresAudit: target.kind === "DEMO" };
  }

  // Non-admins may only ever export their own projects.
  if (target.ownerId !== actor.id) {
    return { allowed: false, reason: "NOT_OWNER" };
  }

  const plan = entitlementsFor(actor.planTier);

  if (target.kind === "DEMO") {
    if (!plan.canExportDemo) {
      return { allowed: false, reason: "DEMO_REQUIRES_PAID_PLAN" };
    }
    // A student demo export is never clean.
    return { allowed: true, disclaimer: true, requiresAudit: false };
  }

  if (!target.hasPass) {
    return { allowed: false, reason: "REAL_EXPORT_NOT_IN_PLAN" };
  }

  return { allowed: true, disclaimer: false, requiresAudit: false };
}

/**
 * Renderer guard. Called by every renderer immediately before emitting bytes.
 *
 * The disclaimer is a property of the resolved policy, not of a template, so a
 * renderer that forgets to draw it produces a failed export rather than a
 * silently clean file.
 */
export function assertDisclaimer(policy: ExportPolicy, disclaimerWasRendered: boolean): void {
  if (!policy.allowed) {
    throw new Error("assertDisclaimer called for an export that was not allowed");
  }
  if (policy.disclaimer && !disclaimerWasRendered) {
    throw new Error(
      "Refusing to emit a demo export without its disclaimer. " +
        "The renderer must draw the title-page block, per-page footer and watermark.",
    );
  }
}
