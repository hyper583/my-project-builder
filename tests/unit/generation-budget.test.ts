import { describe, expect, it } from "vitest";

import {
  computeBudget,
  distribute,
  estimatePages,
  furniturePages,
  wordsForPages,
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

  it("reports the density a real document reaches, not a column of text", () => {
    // 12pt double-spaced is conventionally quoted as about 250 words a page.
    // Running prose does not quite reach that, because paragraph spacing
    // accumulates and short closing lines are wasted; measured against the
    // real renderer it lands near 218 for this layout.
    //
    // The band is deliberately tight. It was previously 180 to 330, which is
    // wide enough that an estimate running 40% optimistic sat inside it
    // unnoticed — a student who asked for 60 to 80 pages was handed 99.
    const typical = wordsPerPage({
      ...DEFAULT_FORMATTING,
      fontSizePt: 12,
      lineSpacing: 2,
      marginInches: { top: 1, right: 1, bottom: 1, left: 1 },
    });

    expect(typical).toBeGreaterThan(210);
    expect(typical).toBeLessThan(226);
    // Comfortably under the typographic convention it is derived from.
    expect(typical).toBeLessThan(250);
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

    expect(budget.minWords).toBe(wordsForPages(40, DEFAULT_FORMATTING, 20));
    expect(budget.maxWords).toBe(wordsForPages(60, DEFAULT_FORMATTING, 20));
    expect(budget.totalWords).toBeGreaterThan(budget.minWords);
    expect(budget.totalWords).toBeLessThan(budget.maxWords);

    // And materially fewer words than the page count times the prose density.
    // That naive product is the mistake this replaced: it assumed every page
    // was full of prose, and produced a document half again too long.
    expect(budget.minWords).toBeLessThan(40 * budget.wordsPerPage);
  });

  it("honours a one-sided minimum without inventing an exact target", () => {
    // "At least 40 pages" is not a request for exactly 40.
    const budget = computeBudget({ minPages: 40, maxPages: null }, DEFAULT_FORMATTING, 20)!;
    expect(budget.maxWords).toBeGreaterThan(budget.minWords);
  });

  it("honours a one-sided maximum", () => {
    const budget = computeBudget({ minPages: null, maxPages: 30 }, DEFAULT_FORMATTING, 20)!;
    expect(budget.minWords).toBeLessThan(budget.maxWords);
    expect(budget.maxWords).toBe(wordsForPages(30, DEFAULT_FORMATTING, 20));
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
  it("is the exact inverse of the target it was budgeted from", () => {
    // The invariant that matters to a student: told 70 pages before
    // generating, they must be told about 70 afterwards. These two functions
    // drifting apart is how the product ends up contradicting itself.
    for (const sections of [12, 24, 40]) {
      for (const target of [40, 70, 100]) {
        const words = wordsForPages(target, DEFAULT_FORMATTING, sections);
        expect(estimatePages(words, DEFAULT_FORMATTING, sections), `${target}pp/${sections}`).toBe(
          target,
        );
      }
    }
  });

  it("counts the structure a barely-written project still renders", () => {
    // Five words across a 24-section project is not one page: the headings,
    // title pages and contents exist as soon as the structure does, and they
    // are what would come out of the printer.
    expect(estimatePages(5, DEFAULT_FORMATTING, 24)).toBeGreaterThan(1);
    // A project with no structure at all is a different matter.
    expect(estimatePages(5, DEFAULT_FORMATTING, 0)).toBeGreaterThanOrEqual(1);
  });
});

describe("furniturePages", () => {
  it("charges for the pages that carry no prose", () => {
    // Title page, contents, reference list, chapter breaks, headings and
    // markers. Ignoring these is what made the estimate 40% optimistic.
    expect(furniturePages(24, DEFAULT_FORMATTING)).toBeGreaterThan(10);
  });

  it("grows with the number of sections", () => {
    expect(furniturePages(40, DEFAULT_FORMATTING)).toBeGreaterThan(
      furniturePages(12, DEFAULT_FORMATTING),
    );
  });

  it("grows with line spacing, because a page then holds fewer lines", () => {
    const single = furniturePages(24, { ...DEFAULT_FORMATTING, lineSpacing: 1 });
    const double = furniturePages(24, { ...DEFAULT_FORMATTING, lineSpacing: 2 });
    expect(double).toBeCloseTo(single * 2, 5);
  });
});

describe("wordsForPages", () => {
  it("asks for fewer words than a naive page count would", () => {
    // The bug in one assertion: multiplying a page target by words-per-page
    // ignores everything on a page that is not prose.
    const naive = 70 * wordsPerPage(DEFAULT_FORMATTING);
    expect(wordsForPages(70, DEFAULT_FORMATTING, 24)).toBeLessThan(naive);
  });

  it("still asks for some prose when the target is smaller than its own furniture", () => {
    expect(wordsForPages(5, DEFAULT_FORMATTING, 40)).toBeGreaterThan(0);
  });
});
