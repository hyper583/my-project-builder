import { describe, expect, it } from "vitest";

import {
  computeBudget,
  distribute,
  estimatePages,
  sectionWeight,
  wordsPerPage,
} from "@/server/services/generation/budget";
import { DEFAULT_FORMATTING } from "@/server/services/export/document";

/**
 * The page budget.
 *
 * A student asks for pages; a language model can only be asked for words. The
 * conversion is an estimate, so what these tests protect is that it moves in
 * the right direction and by a sensible amount — not that it is exact, which
 * it cannot be.
 */

describe("wordsPerPage", () => {
  it("halves roughly when spacing doubles", () => {
    const single = wordsPerPage({ ...DEFAULT_FORMATTING, lineSpacing: 1 });
    const double = wordsPerPage({ ...DEFAULT_FORMATTING, lineSpacing: 2 });

    expect(double).toBeLessThan(single);
    expect(double / single).toBeCloseTo(0.5, 1);
  });

  it("falls as type size grows", () => {
    const small = wordsPerPage({ ...DEFAULT_FORMATTING, fontSizePt: 10 });
    const large = wordsPerPage({ ...DEFAULT_FORMATTING, fontSizePt: 14 });
    expect(large).toBeLessThan(small);
  });

  it("falls as margins widen", () => {
    const tight = wordsPerPage({
      ...DEFAULT_FORMATTING,
      marginInches: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
    });
    const wide = wordsPerPage({
      ...DEFAULT_FORMATTING,
      marginInches: { top: 1.5, right: 1.5, bottom: 1.5, left: 2 },
    });
    expect(wide).toBeLessThan(tight);
  });

  it("lands near the figure departments actually quote", () => {
    // 12pt double-spaced is conventionally about 250 words a page.
    const typical = wordsPerPage({
      ...DEFAULT_FORMATTING,
      fontSizePt: 12,
      lineSpacing: 2,
      marginInches: { top: 1, right: 1, bottom: 1, left: 1 },
    });
    expect(typical).toBeGreaterThan(180);
    expect(typical).toBeLessThan(330);
  });
});

describe("computeBudget", () => {
  it("returns null when no range was asked for", () => {
    // No target is different from a target of zero — the generator should be
    // left unconstrained rather than told to write nothing.
    expect(computeBudget({ minPages: null, maxPages: null }, DEFAULT_FORMATTING, 20)).toBeNull();
  });

  it("turns a page range into a word range", () => {
    const budget = computeBudget({ minPages: 40, maxPages: 60 }, DEFAULT_FORMATTING, 20)!;

    expect(budget.minWords).toBe(40 * budget.wordsPerPage);
    expect(budget.maxWords).toBe(60 * budget.wordsPerPage);
    expect(budget.totalWords).toBeGreaterThan(budget.minWords);
    expect(budget.totalWords).toBeLessThan(budget.maxWords);
  });

  it("honours a one-sided minimum without inventing an exact target", () => {
    // "At least 40 pages" is not a request for exactly 40.
    const budget = computeBudget({ minPages: 40, maxPages: null }, DEFAULT_FORMATTING, 20)!;
    expect(budget.maxWords).toBeGreaterThan(budget.minWords);
  });

  it("honours a one-sided maximum", () => {
    const budget = computeBudget({ minPages: null, maxPages: 30 }, DEFAULT_FORMATTING, 20)!;
    expect(budget.minWords).toBeLessThan(budget.maxWords);
    expect(budget.maxWords).toBe(30 * budget.wordsPerPage);
  });

  it("asks for more words when the layout fits fewer per page", () => {
    const sparse = computeBudget(
      { minPages: 50, maxPages: 50 },
      { ...DEFAULT_FORMATTING, fontSizePt: 14, lineSpacing: 2 },
      20,
    )!;
    const dense = computeBudget(
      { minPages: 50, maxPages: 50 },
      { ...DEFAULT_FORMATTING, fontSizePt: 10, lineSpacing: 1 },
      20,
    )!;

    // Same page count, denser layout, so more words are needed to fill it.
    expect(dense.totalWords).toBeGreaterThan(sparse.totalWords);
  });
});

describe("distribution across sections", () => {
  it("gives a literature review more than a definition of terms", () => {
    expect(sectionWeight("Empirical Review", "Literature Review")).toBeGreaterThan(
      sectionWeight("Definition of Terms", "Introduction"),
    );
  });

  it("spends the whole budget, roughly", () => {
    const budget = computeBudget({ minPages: 40, maxPages: 60 }, DEFAULT_FORMATTING, 6)!;
    const sections = [
      { title: "Background to the Study", chapterTitle: "Introduction" },
      { title: "Definition of Terms", chapterTitle: "Introduction" },
      { title: "Empirical Review", chapterTitle: "Literature Review" },
      { title: "Research Design", chapterTitle: "Research Methodology" },
      { title: "Discussion of Findings", chapterTitle: "Results and Discussion" },
      { title: "Conclusion", chapterTitle: "Summary" },
    ];

    const allocation = distribute(budget, sections);
    const total = allocation.reduce((sum, n) => sum + n, 0);

    expect(allocation).toHaveLength(sections.length);
    expect(total).toBeGreaterThan(budget.totalWords * 0.9);
    expect(total).toBeLessThan(budget.totalWords * 1.15);
  });

  it("never asks for a stub", () => {
    // Below roughly 120 words the instruction produces a fragment rather than
    // a short section, so that is the floor.
    const budget = computeBudget({ minPages: 3, maxPages: 3 }, DEFAULT_FORMATTING, 40)!;
    const sections = Array.from({ length: 40 }, () => ({
      title: "Definition of Terms",
      chapterTitle: "Introduction",
    }));

    for (const words of distribute(budget, sections)) {
      expect(words).toBeGreaterThanOrEqual(120);
    }
  });

  it("handles a project with no sections", () => {
    const budget = computeBudget({ minPages: 40, maxPages: 60 }, DEFAULT_FORMATTING, 0)!;
    expect(distribute(budget, [])).toEqual([]);
  });
});

describe("estimatePages", () => {
  it("is the inverse of the word budget", () => {
    const perPage = wordsPerPage(DEFAULT_FORMATTING);
    expect(estimatePages(perPage * 10, DEFAULT_FORMATTING)).toBe(10);
  });

  it("never reports zero pages for text that exists", () => {
    expect(estimatePages(5, DEFAULT_FORMATTING)).toBe(1);
  });
});
