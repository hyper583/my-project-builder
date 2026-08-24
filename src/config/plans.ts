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
 * Which payment methods the checkout offers, in this order.
 *
 * Not the default set, and the order is the point. Card penetration among
 * Nigerian students is low and card success rates are worse, so leading with
 * one costs conversions from people who were willing to pay. A bank transfer
 * gets a dedicated one-time account number and confirms in seconds; USSD works
 * from a phone with no banking app at all. Card stays available, last.
 *
 * Paystack shows its own defaults when this is omitted, which is what the
 * checkout used to do.
 */
export const PASS_CHANNELS = ["bank_transfer", "ussd", "card"] as const;

/**
 * What one project pass includes.
 *
 * Three runs covers writing the project and changing direction twice; 150
 * editing actions covers reworking it section by section. Both are quotas on
 * the project rather than a monthly rate, so they do not renew — and a student
 * who takes six months over their project is not punished for it, which is
 * what an expiry date would have done.
 *
 * `maxChapters` is what a pass actually releases: the whole document. It is the
 * counterpart to the single chapter a free project gets, and it is enforced
 * where the work is queued rather than where it is displayed.
 */
export const PASS_ALLOWANCE = {
  maxGenerations: 3,
  maxEdits: 150,
  maxChapters: Number.POSITIVE_INFINITY,
} as const;

/**
 * What a project without a pass includes.
 *
 * Generation is deliberately included, and deliberately bounded to ONE chapter.
 * A student who has never seen the product write about their own topic has no
 * reason to buy a pass — so they get Chapter 1, on their own subject, readable
 * in full. What they do not get is the other four-fifths.
 *
 * `maxChapters` replaced a download-only paywall that did not work. The whole
 * document was written and shown in the workspace, and the only thing stopping
 * a student was the Export button — so selecting the text and pasting it into
 * Word was a complete bypass. Prose that is never generated cannot be pasted.
 *
 * `maxGenerations` is per PROJECT here, not per month. The rolling window it
 * replaced made a student wait thirty days to see anything from a second
 * project, which punished the exact behaviour worth encouraging. The per-person
 * bound moved to `FREE_LIFETIME_PROJECTS` instead, which is where it belongs.
 */
export const FREE_PROJECT_ALLOWANCE = {
  maxGenerations: 1,
  maxEdits: 25,
  maxChapters: 1,
} as const;

/**
 * How long one assistant reply may be, by whether the project is paid for.
 *
 * This is a paywall, not a cost control, and it closes the largest hole in the
 * chapter gate. The assistant is a general-purpose writer sitting inside the
 * workspace: a student whose Chapter 2 will not generate can simply ask the
 * chat to write Chapter 2, and before this it would — four thousand tokens at
 * a time, twenty-five times over. Bounding what generation writes achieves
 * nothing while a second door produces the same prose on request.
 *
 * 800 tokens is roughly 600 words. Enough to explain how to frame a hypothesis,
 * what a methodology section has to establish, or how to fix a paragraph the
 * student pastes in — and too short to be a chapter.
 *
 * A ceiling rather than an instruction, because instructions can be argued
 * with. The prompt rule that accompanies this is worth having, but it is the
 * polite half; this is the half that holds.
 */
export const ASSISTANT_MAX_TOKENS = {
  free: 800,
  paid: 4000,
} as const;

/**
 * How many projects one ACCOUNT may ever have written for free.
 *
 * Acquisition spend has to be bounded per human, and per project alone is not a
 * bound: a student's own delete is soft (`deletedAt`), and `maxProjects` counts
 * only undeleted projects — so delete-and-recreate would be an unlimited supply
 * of free chapters. Two matches `PLANS.FREE.maxProjects`, so someone comparing
 * two topics can see both, and a third costs money.
 *
 * Counted in PROJECTS rather than runs, because "a run" is not a stable unit —
 * the pipeline records usage per model call, and an earlier version of this
 * counted those and told a student they had used eighty-nine free runs.
 *
 * Lifetime rather than windowed, because a window makes this bound expire and
 * the whole point is that it does not.
 */
export const FREE_LIFETIME_PROJECTS = 2;

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

/**
 * The price, written the way a person reads it.
 *
 * Derived from the same constant the checkout charges, so the page and the
 * payment cannot disagree. A hardcoded "₦25,000" in the marketing copy is a
 * promise the server has no idea it made.
 *
 * No decimals: ₦25,000 is the price, and "₦25,000.00" reads like a form field.
 * A price with kobo in it would show them, which is the correct behaviour for a
 * price that has any.
 */
export function formatPassPrice(
  amountMinor: number = PASS_PRICE_KOBO,
  currency: string = PASS_CURRENCY,
): string {
  const major = amountMinor / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
  }).format(major);
}
