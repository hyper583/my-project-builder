/**
 * Plan entitlements.
 *
 * Pricing and entitlements live here as configuration — never hard-coded into
 * application logic. The export pipeline, wizard and admin dashboard all read
 * from this file, so a paywall can move without touching a single feature.
 */

export type PlanTier = "FREE" | "PAID";

export interface PlanEntitlements {
  /** Human-readable label shown in the UI. */
  readonly label: string;
  /** May a user on this plan export a DEMO project? Admins bypass this entirely. */
  readonly canExportDemo: boolean;
  /** May a user on this plan export their own REAL projects? */
  readonly canExportReal: boolean;
  /** Maximum concurrently active (non-archived, non-deleted) projects. */
  readonly maxProjects: number;
  /** Total upload storage in megabytes. */
  readonly maxStorageMb: number;
  /** AI generation runs per calendar month. */
  readonly maxGenerationsPerMonth: number;
  /** AI editing actions per calendar month. */
  readonly maxEditsPerMonth: number;
}

export const PLANS: Record<PlanTier, PlanEntitlements> = {
  FREE: {
    label: "Free",
    canExportDemo: false,
    canExportReal: true,
    maxProjects: 2,
    maxStorageMb: 50,
    maxGenerationsPerMonth: 1,
    maxEditsPerMonth: 25,
  },
  PAID: {
    label: "Student Pro",
    canExportDemo: true,
    canExportReal: true,
    maxProjects: 25,
    maxStorageMb: 1000,
    maxGenerationsPerMonth: 20,
    maxEditsPerMonth: 1000,
  },
} as const;

export function entitlementsFor(tier: PlanTier): PlanEntitlements {
  return PLANS[tier];
}
