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
 * The most one project pass may cost to serve, ever.
 *
 * Ever, not per month. A pass is bought once at ₦25,000 — about $18 — and is
 * consumed by a single project, so this ceiling is the whole lifetime cost of
 * that sale. It leaves roughly 70% gross margin before payment fees and the
 * cost of free users who never convert.
 *
 * This used to be a monthly figure, which was the defect: entitlements came
 * from `User.planTier` with no end, so one payment bought a renewing allowance
 * forever and turned loss-making inside four months.
 */
export const PASS_CEILING_USD = 5.6;

/**
 * The price of one project pass, in kobo.
 *
 * Minor units because that is what Paystack transacts in, and because storing
 * money as a float is how rounding errors become refunds. ₦25,000.
 *
 * Settled after measuring what a project actually costs to serve: about $0.72
 * of generation plus the editing tail, against roughly $18 of revenue.
 */
export const PASS_PRICE_KOBO = 2_500_000;

/**
 * The currency the price above is denominated in.
 *
 * Checked against what Paystack reports before a pass is granted. A transaction
 * that paid 2,500,000 of something else is not ₦25,000.
 */
export const PASS_CURRENCY = "NGN";

/**
 * What one project pass includes.
 *
 * Three runs covers writing the project and changing direction twice; 150
 * editing actions covers reworking it section by section. Both are quotas on
 * the project rather than a monthly rate, so they do not renew — and a student
 * who takes six months over their project is not punished for it, which is
 * what an expiry date would have done.
 */
export const PASS_ALLOWANCE = {
  maxGenerations: 3,
  maxEdits: 150,
} as const;

/**
 * What a project without a pass includes.
 *
 * Counted per PERSON over a rolling 30 days rather than per project — this is
 * acquisition spend, so it has to be bounded per human. Counted per project it
 * would let someone delete and recreate their way to unlimited free runs.
 *
 * Generation is deliberately included. A student who has never seen the
 * product write about their own topic has no reason to buy a pass; what they
 * cannot do is take the document away.
 */
export const FREE_PROJECT_ALLOWANCE = {
  maxGenerations: 1,
  maxEdits: 25,
} as const;

export interface PlanEntitlements {
  /** Human-readable label shown in the UI. */
  readonly label: string;
  /** May a user on this plan export a DEMO project? Admins bypass this entirely. */
  readonly canExportDemo: boolean;
  /** Maximum concurrently active (non-archived, non-deleted) projects. */
  readonly maxProjects: number;
  /** Total upload storage in megabytes. */
  readonly maxStorageMb: number;
}

/**
 * Account-level entitlements.
 *
 * Only what belongs to a PERSON lives here. What a student may do with a
 * particular project — generate it, edit it, download it — is decided per
 * project by `projectEntitlements`, because that is what is actually bought.
 *
 * `canExportReal` used to live here and was the defect this whole change
 * exists to fix: it was a permanent property of an account, so one payment
 * granted it forever.
 */
export const PLANS: Record<PlanTier, PlanEntitlements> = {
  FREE: {
    label: "Free",
    /* The sample is an illustration of the product, so it stays behind the
       paywall; the student's own work is released by a pass instead. */
    canExportDemo: false,
    maxProjects: 2,
    maxStorageMb: 50,
  },

  PAID: {
    label: "Student Pro",
    canExportDemo: true,
    maxProjects: 5,
    maxStorageMb: 500,
  },
} as const;

/**
 * What an allowance costs to serve if it is taken in full.
 *
 * The ceiling, not the expectation — almost nobody exhausts an allowance. It
 * exists so the worst case is a known number rather than a discovery.
 */
export function allowanceCeilingUsd(allowance: {
  maxGenerations: number;
  maxEdits: number;
}): number {
  return allowance.maxGenerations * GENERATION_COST_USD + allowance.maxEdits * EDIT_COST_USD;
}

export function entitlementsFor(tier: PlanTier): PlanEntitlements {
  return PLANS[tier];
}
