import { describe, expect, it } from "vitest";

import {
  EDIT_COST_USD,
  FREE_PROJECT_ALLOWANCE,
  GENERATION_COST_USD,
  PASS_ALLOWANCE,
  PASS_CEILING_USD,
  PLANS,
  allowanceCeilingUsd,
} from "@/config/plans";

/**
 * What the allowances cost to serve.
 *
 * An entitlement is a bill, and these were written as feature configuration by
 * someone who had never costed them: the paid plan offered 20 generation runs
 * and 1,000 editing actions a month, about $58.60 of API spend against a
 * one-time payment worth roughly $18. Nothing failed, because nothing was
 * checking. These tests are that check.
 */

describe("what a project pass costs to serve", () => {
  it("stays under the ceiling one pass earns", () => {
    expect(allowanceCeilingUsd(PASS_ALLOWANCE)).toBeLessThanOrEqual(PASS_CEILING_USD);
  });

  it("is a lifetime cost, not a monthly one", () => {
    /*
     * The distinction the whole model turns on. A pass is consumed by one
     * project, so its ceiling is the entire cost of that sale — there is no
     * second month in which the same payment buys another allowance.
     *
     * At ₦25,000 (about $18) against a $5.46 ceiling, that is roughly 70%
     * gross margin. The old model charged the same once and served that
     * allowance again every thirty days, forever.
     */
    const perPass = allowanceCeilingUsd(PASS_ALLOWANCE);
    const twelveMonthsOfTheOldModel = perPass * 12;
    expect(twelveMonthsOfTheOldModel).toBeGreaterThan(18);
    expect(perPass).toBeLessThan(18);
  });

  it("keeps a free project cheap enough to acquire a paying one", () => {
    // Free users are marketing spend. At a tenth converting, each payer costs
    // ten of these — it has to stay small next to the price of a pass.
    expect(allowanceCeilingUsd(FREE_PROJECT_ALLOWANCE)).toBeLessThan(1.5);
  });

  it("costs strictly more to serve a pass than a free project", () => {
    expect(allowanceCeilingUsd(PASS_ALLOWANCE)).toBeGreaterThan(
      allowanceCeilingUsd(FREE_PROJECT_ALLOWANCE),
    );
  });

  it("is computed from the measured unit costs, not a hard-coded total", () => {
    expect(allowanceCeilingUsd(PASS_ALLOWANCE)).toBeCloseTo(
      PASS_ALLOWANCE.maxGenerations * GENERATION_COST_USD +
        PASS_ALLOWANCE.maxEdits * EDIT_COST_USD,
      6,
    );
  });
});

describe("what each allowance includes", () => {
  it("lets a project without a pass be generated, so there is something to buy", () => {
    // A student who has never seen the product write about their own topic has
    // no reason to pay for it. What they cannot do is take the document away.
    expect(FREE_PROJECT_ALLOWANCE.maxGenerations).toBeGreaterThan(0);
  });

  it("allows enough runs to change direction, and no more", () => {
    // One run writes the project; the rest are for changing your mind.
    expect(PASS_ALLOWANCE.maxGenerations).toBeGreaterThanOrEqual(2);
    expect(PASS_ALLOWANCE.maxGenerations).toBeLessThanOrEqual(5);
  });

  it("no longer decides downloading from the account", () => {
    /*
     * `canExportReal` used to live on the plan, which made the right to
     * download a permanent property of an ACCOUNT — one payment released every
     * project it would ever create. Whether a document can be downloaded is
     * now a question about the project, answered by `resolveExportPolicy` from
     * whether a pass was spent on it.
     */
    for (const plan of Object.values(PLANS)) {
      expect(plan).not.toHaveProperty("canExportReal");
      expect(plan).not.toHaveProperty("maxGenerationsPerMonth");
      expect(plan).not.toHaveProperty("maxEditsPerMonth");
    }
  });

  it("keeps the sample export as an account-level perk", () => {
    // The sample illustrates the product rather than being the student's work,
    // so it is not something a project pass releases.
    expect(PLANS.FREE.canExportDemo).toBe(false);
    expect(PLANS.PAID.canExportDemo).toBe(true);
  });
});
