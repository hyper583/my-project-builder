import { describe, expect, it } from "vitest";

import { AILMENT_REMEDY, type JobAilment } from "@/server/services/ops/health";
import { summarise, isRecordable } from "@/server/services/ops/record-error";

/**
 * The operations console's two judgements.
 *
 * Both are the kind of logic that is easy to get subtly wrong and impossible to
 * notice: a misclassified job reads as healthy, and an over-eager error log
 * quietly accumulates student prose. Neither would announce itself.
 */

describe("ailment remedies", () => {
  const ailments: JobAilment[] = [
    "failed",
    "exhausted",
    "abandoned",
    "orphaned",
    "unattended",
  ];

  it("covers every ailment the classifier can produce", () => {
    // A missing entry renders as blank in the console — the operator sees a
    // problem with no stated fix, which is the one thing this panel exists to
    // avoid.
    for (const ailment of ailments) {
      expect(AILMENT_REMEDY[ailment], ailment).toBeTruthy();
    }
    expect(Object.keys(AILMENT_REMEDY).sort()).toEqual([...ailments].sort());
  });

  it("tells the operator what to do, not only what is wrong", () => {
    // Each remedy names an action. "Stuck" without a next step is not a remedy.
    for (const ailment of ailments) {
      expect(AILMENT_REMEDY[ailment], ailment).toMatch(/requeue|start|wait/i);
    }
  });

  it("distinguishes the two silences that need opposite fixes", () => {
    // A job nothing can claim and a job with no worker running look identical
    // from outside. Requeueing the second one changes nothing.
    expect(AILMENT_REMEDY.exhausted).toMatch(/requeue/i);
    expect(AILMENT_REMEDY.orphaned).toMatch(/start/i);
    expect(AILMENT_REMEDY.unattended).toMatch(/start/i);
  });
});

describe("which errors are recorded", () => {
  it("records genuine faults", () => {
    for (const code of ["INTERNAL", "AI_FAILED", "EXPORT_FAILED"]) {
      expect(isRecordable(code), code).toBe(true);
    }
  });

  it("ignores ordinary events", () => {
    // Someone typing something wrong, or reaching the ceiling their plan says
    // they have, is normal use. Logging it would bury real incidents.
    for (const code of ["VALIDATION", "PLAN_LIMIT", "NOT_FOUND", "UNAUTHENTICATED"]) {
      expect(isRecordable(code), code).toBe(false);
    }
  });
});

describe("error summaries", () => {
  it("keeps a short message whole", () => {
    expect(summarise("Anthropic request failed")).toBe("Anthropic request failed");
  });

  it("keeps only the first line", () => {
    // Stack traces and multi-paragraph model output arrive as one string; the
    // list needs one line per row.
    expect(summarise("Request failed\n    at Anthropic.generate\n    at run")).toBe(
      "Request failed",
    );
  });

  it("caps a long first line so a draft cannot fill the list", () => {
    // An AI failure can quote the section it was working on. The full text
    // stays in `detail`, behind the audited reveal.
    const draft = "The student wrote a very long paragraph. ".repeat(20);
    const result = summarise(draft);

    expect(result.length).toBeLessThanOrEqual(161);
    expect(result.endsWith("…")).toBe(true);
  });

  it("trims surrounding whitespace rather than reporting a blank row", () => {
    expect(summarise("   Something broke   \n more")).toBe("Something broke");
  });
});
