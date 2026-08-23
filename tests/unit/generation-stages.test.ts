import { describe, expect, it } from "vitest";

import {
  buildStages,
  EPILOGUE_STAGES,
  isResultsChapter,
  PROLOGUE_STAGES,
} from "@/server/services/jobs/stages";

/**
 * The order the pipeline runs in.
 *
 * One thing here is load-bearing and was wrong: source retrieval used to be
 * the first epilogue stage, so every chapter was written before a single
 * source existed. The reading list that came back was accurate and completely
 * disconnected from the document it was attached to — whatever citations
 * appeared in the prose referred to nothing, because there had been nothing to
 * refer to.
 */

const CHAPTERS = [
  { id: "c1", number: "1", title: "Introduction" },
  { id: "c2", number: "2", title: "Literature Review" },
  { id: "c3", number: "4", title: "Results and Discussion" },
];

describe("stage order", () => {
  it("finds sources before it writes a word", () => {
    const keys = buildStages(CHAPTERS).map((stage) => stage.key);

    const references = keys.indexOf("references");
    const firstChapter = keys.findIndex((key) => key.startsWith("chapter:"));

    expect(references).toBeGreaterThanOrEqual(0);
    expect(firstChapter).toBeGreaterThanOrEqual(0);
    expect(references).toBeLessThan(firstChapter);
  });

  it("keeps retrieval in the prologue, not the epilogue", () => {
    // Stated twice on purpose. The assertion above would still pass if
    // retrieval were moved somewhere else ahead of the chapters; this one
    // pins where it actually belongs.
    expect(PROLOGUE_STAGES.map((s) => s.key)).toContain("references");
    expect(EPILOGUE_STAGES.map((s) => s.key)).not.toContain("references");
  });

  it("checks consistency only once there is something to check", () => {
    const keys = buildStages(CHAPTERS).map((stage) => stage.key);
    const lastChapter = keys.map((k) => k.startsWith("chapter:")).lastIndexOf(true);

    expect(keys.indexOf("consistency")).toBeGreaterThan(lastChapter);
    expect(keys.indexOf("finalise")).toBe(keys.length - 1);
  });

  it("scaffolds a results chapter instead of writing it", () => {
    // The chapter that would otherwise invent findings.
    const stages = buildStages(CHAPTERS);
    const results = stages.find((s) => s.chapterId === "c3");
    const intro = stages.find((s) => s.chapterId === "c1");

    expect(results?.kind).toBe("scaffold");
    expect(intro?.kind).toBe("chapter");
  });

  it("detects the results chapter under the titles departments actually use", () => {
    /*
     * The pattern used to require singular words behind word boundaries, so
     * `result` could not match "Results" — the boundary needs a non-word
     * character and `s` is not one. The default template's own Chapter 4 was
     * therefore never detected, and the scaffold path was inert for real
     * projects. Only the system prompt's placeholder rule was catching it.
     */
    for (const title of [
      "Results and Discussion",
      "Result and Discussion",
      "Presentation of Results",
      "Data Presentation and Analysis",
      "Analysis of Findings",
      "Findings and Discussion",
      "Data Analysis and Interpretation",
      "Presentation and Analysis of Data",
    ]) {
      expect(isResultsChapter(title), title).toBe(true);
    }
  });

  it("leaves the concluding chapter alone even though it names findings", () => {
    // "Summary of Findings and Conclusion" is a common chapter five title.
    // Scaffolding it would answer a conclusion with "what this section will
    // present once you add your data".
    for (const title of [
      "Summary, Conclusion and Recommendations",
      "Summary of Findings and Conclusion",
      "Conclusion and Recommendations",
    ]) {
      expect(isResultsChapter(title), title).toBe(false);
    }
  });

  it("leaves the chapters that carry ordinary prose alone", () => {
    for (const title of ["Introduction", "Literature Review", "Research Methodology"]) {
      expect(isResultsChapter(title), title).toBe(false);
    }
  });

  it("still produces a runnable sequence for a project with no chapters", () => {
    const keys = buildStages([]).map((stage) => stage.key);
    expect(keys).toEqual([...PROLOGUE_STAGES, ...EPILOGUE_STAGES].map((s) => s.key));
  });
});
