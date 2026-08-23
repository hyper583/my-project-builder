/**
 * Plan entitlements.
 *
 * Pricing and entitlements live here as configuration — never hard-coded into
 * application logic. The export pipeline, wizard and admin dashboard all read
 * from this file, so a paywall can move without touching a single feature.
 *
 * Every allowance below is a bill. The costs are measured, not assumed, and
 * `MONTHLY_CEILING_USD` is asserted in the tests, so a number raised here
 * without thinking fails the suite rather than the bank account.
 */

export type PlanTier = "FREE" | "PAID";

/**
 * What one generation run costs to serve, in US dollars.
 *
 * Measured. The first real project generated — 16,676 words across 24 sections
 * on Claude Opus 5 — cost $1.133 over 25 API calls, of which output tokens
 * were 98%. Since the page estimate was calibrated, a 60 to 80 page project is
 * budgeted at about 10,120 words rather than 16,676, and cost scales with
 * output, which puts a full run near the figure below.
 */
export const GENERATION_COST_USD = 0.72;

/**
 * What one AI edit or assistant message costs, in US dollars.
 *
 * Claude Sonnet 5, roughly 3,000 tokens in and 800 out. Individually trivial,
 * which is exactly why the allowance matters: the interactive tail costs
 * several times the generation it is editing.
 */
export const EDIT_COST_USD = 0.022;

/**
 * The most a single paying month may cost to serve.
 *
 * Set against a one-time project pass of ₦25,000 — about $18 — so a ceiling
 * near $5.40 leaves roughly 70% gross margin before payment fees and the cost
 * of free users who never convert.
 */
export const MONTHLY_CEILING_USD = 5.6;

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
  /** AI generation runs per rolling 30 days. */
  readonly maxGenerationsPerMonth: number;
  /** AI editing actions and assistant messages per rolling 30 days. */
  readonly maxEditsPerMonth: number;
}

export const PLANS: Record<PlanTier, PlanEntitlements> = {
  /**
   * Generate freely, export nothing.
   *
   * A free student can run the wizard, generate their project and read every
   * word of it in the workspace. What they cannot do is take it away. That is
   * the whole paywall, and it sits at the moment the work becomes useful
   * rather than at the moment it becomes visible — a student who has not seen
   * the thing written about their own topic has no reason to pay for it.
   *
   * `canExportReal` was previously true, which gave the product away: a free
   * account could generate a complete real project and download it, and the
   * only thing the paid plan added to exporting was the *sample*. That is
   * backwards — it charged for the demonstration and released the deliverable.
   */
  FREE: {
    label: "Free",
    canExportDemo: false,
    canExportReal: false,
    maxProjects: 2,
    maxStorageMb: 50,
    maxGenerationsPerMonth: 1,
    maxEditsPerMonth: 25,
  },

  /**
   * One project, properly.
   *
   * Three generation runs covers writing the project and changing direction
   * twice; 150 editing actions covers reworking it section by section. Both
   * are generous against observed use and bounded against cost.
   *
   * These were 20 runs and 1,000 edits, which nobody had costed: a user taking
   * what the plan promised would have cost about $58.60 a month against a
   * ₦25,000 one-time pass. The limits were written as feature configuration
   * rather than as a spending ceiling, and they were the largest financial
   * risk in the repository.
   */
  PAID: {
    label: "Student Pro",
    canExportDemo: true,
    canExportReal: true,
    maxProjects: 5,
    maxStorageMb: 500,
    maxGenerationsPerMonth: 3,
    maxEditsPerMonth: 150,
  },
} as const;

/**
 * What a plan costs to serve if a user takes everything it offers.
 *
 * The ceiling, not the expectation — almost nobody exhausts an allowance. It
 * exists so the worst case is a known number rather than a discovery.
 */
export function monthlyCeilingUsd(tier: PlanTier): number {
  const plan = PLANS[tier];
  return (
    plan.maxGenerationsPerMonth * GENERATION_COST_USD + plan.maxEditsPerMonth * EDIT_COST_USD
  );
}

export function entitlementsFor(tier: PlanTier): PlanEntitlements {
  return PLANS[tier];
}
