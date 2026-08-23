import { describe, expect, it } from "vitest";

import {
  EDIT_COST_USD,
  GENERATION_COST_USD,
  MONTHLY_CEILING_USD,
  PLANS,
  monthlyCeilingUsd,
} from "@/config/plans";

/**
 * What the plans cost to serve.
 *
 * An entitlement is a bill, and these were written as feature configuration by
 * someone who had never costed them: the paid plan offered 20 generation runs
 * and 1,000 editing actions a month, about $58.60 of API spend against a
 * one-time pass worth roughly $18. Nothing failed, because nothing was
 * checking. These tests are that check.
 */

describe("what a plan costs to serve", () => {
  it("keeps a paid month under the ceiling a project pass earns", () => {
    expect(monthlyCeilingUsd("PAID")).toBeLessThanOrEqual(MONTHLY_CEILING_USD);
  });

  it("keeps a free user cheap enough to acquire a paying one", () => {
    // Free users are marketing spend. At a tenth converting, each payer costs
    // ten of these — it has to stay small next to the price of a pass.
    expect(monthlyCeilingUsd("FREE")).toBeLessThan(1.5);
  });

  it("costs strictly more to serve a paid user than a free one", () => {
    expect(monthlyCeilingUsd("PAID")).toBeGreaterThan(monthlyCeilingUsd("FREE"));
  });

  it("is computed from the measured unit costs, not a hard-coded total", () => {
    const paid = PLANS.PAID;
    expect(monthlyCeilingUsd("PAID")).toBeCloseTo(
      paid.maxGenerationsPerMonth * GENERATION_COST_USD + paid.maxEditsPerMonth * EDIT_COST_USD,
      6,
    );
  });
});

describe("what each plan allows", () => {
  it("does not let a free account take the deliverable away", () => {
    // The paywall is the download, not the writing.
    expect(PLANS.FREE.canExportReal).toBe(false);
    expect(PLANS.FREE.canExportDemo).toBe(false);
  });

  it("lets a free account generate, so there is something to pay for", () => {
    // A student who has never seen the product write about their own topic has
    // no reason to buy it.
    expect(PLANS.FREE.maxGenerationsPerMonth).toBeGreaterThan(0);
  });

  it("lets a paid account export both its own work and a sample", () => {
    expect(PLANS.PAID.canExportReal).toBe(true);
    expect(PLANS.PAID.canExportDemo).toBe(true);
  });

  it("allows enough runs to change direction, and no more", () => {
    // One run writes the project; the rest are for changing your mind. An
    // unbounded number is how a one-time payment becomes an open tab.
    expect(PLANS.PAID.maxGenerationsPerMonth).toBeGreaterThanOrEqual(2);
    expect(PLANS.PAID.maxGenerationsPerMonth).toBeLessThanOrEqual(5);
  });
});
