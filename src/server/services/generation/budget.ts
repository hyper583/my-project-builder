import type { ExportFormatting } from "@/server/services/export/document";

/**
 * Turning a page target into something a generator can aim at.
 *
 * A language model cannot target pages — it has no idea how the text will be
 * laid out. So a requested page range becomes a word budget using the
 * student's *own* formatting, and that budget is divided across the sections
 * that actually carry prose.
 *
 * The conversion is an estimate and is presented as one. Words per page vary
 * with font, size, spacing, margins and how many tables a chapter contains, so
 * the product measures what was produced and reports estimated pages against
 * the target rather than claiming to have hit it.
 */

/**
 * Words on a full page at 12pt, single-spaced, one-inch margins.
 *
 * The figure academic departments themselves use when they quote word counts
 * alongside page counts. Everything below scales from it.
 */
const WORDS_PER_PAGE_BASE = 500;

/** Words per page for a given layout. */
export function wordsPerPage(formatting: ExportFormatting): number {
  // Line spacing is the dominant factor: double spacing halves the lines that
  // fit, so it roughly halves the words.
  const spacingFactor = 1 / Math.max(1, formatting.lineSpacing);

  // Type size scales the number of lines and the characters per line, so its
  // effect is closer to quadratic than linear.
  const sizeFactor = (12 / Math.max(8, formatting.fontSizePt)) ** 2;

  // Margins eat the text block on both axes.
  const { top, right, bottom, left } = formatting.marginInches;
  const textWidth = Math.max(2, 8.27 - left - right); // A4 is 8.27in wide
  const textHeight = Math.max(3, 11.69 - top - bottom); // and 11.69in tall
  const areaFactor = (textWidth * textHeight) / ((8.27 - 2) * (11.69 - 2));

  return Math.round(WORDS_PER_PAGE_BASE * spacingFactor * sizeFactor * areaFactor);
}

export interface WordBudget {
  /** Total words to aim for across the whole document. */
  totalWords: number;
  minWords: number;
  maxWords: number;
  wordsPerPage: number;
  /** Words per prose-bearing section, before per-section weighting. */
  perSection: number;
}

/**
 * Converts a page range into a word budget.
 *
 * Returns null when no range was requested, so callers can tell "no target"
 * apart from "a target of zero" and simply not constrain the generator.
 */
export function computeBudget(
  settings: { minPages: number | null; maxPages: number | null },
  formatting: ExportFormatting,
  sectionCount: number,
): WordBudget | null {
  const min = settings.minPages ?? null;
  const max = settings.maxPages ?? null;
  if (min === null && max === null) return null;

  const perPage = wordsPerPage(formatting);

  // A one-sided range is honoured as given rather than invented around: asking
  // for "at least 40 pages" is not a request for exactly 40.
  const minPages = min ?? Math.max(1, (max ?? 1) * 0.75);
  const maxPages = max ?? (min ?? 1) * 1.25;

  const minWords = Math.round(minPages * perPage);
  const maxWords = Math.round(maxPages * perPage);

  // Aim at the middle, so overshooting one section does not immediately break
  // the upper bound.
  const totalWords = Math.round((minWords + maxWords) / 2);

  return {
    totalWords,
    minWords,
    maxWords,
    wordsPerPage: perPage,
    perSection: sectionCount > 0 ? Math.round(totalWords / sectionCount) : totalWords,
  };
}

/**
 * How much of the budget one section should carry.
 *
 * Sections are not equal: a literature review is several times the length of a
 * definition of terms, and dividing the budget evenly produces a document that
 * is uniformly wrong. The weights below are rough but they are much closer
 * than an even split.
 */
export function sectionWeight(title: string, chapterTitle: string): number {
  const text = `${chapterTitle} ${title}`.toLowerCase();

  // The substantial ones.
  if (/literature|empirical|review of related|conceptual framework/.test(text)) return 2.2;
  if (/discussion|analysis of findings|presentation of results/.test(text)) return 1.8;
  if (/background|introduction/.test(text)) return 1.4;
  if (/methodology|research design|data collection|data analysis/.test(text)) return 1.2;

  // The short ones — a list of definitions is not 900 words.
  if (/definition of terms|scope|limitation|significance/.test(text)) return 0.6;
  if (/research questions|hypotheses|aim and objectives/.test(text)) return 0.5;
  if (/summary|conclusion|recommendation|further research/.test(text)) return 0.8;

  return 1;
}

/** Distributes a budget across sections by weight. */
export function distribute(
  budget: WordBudget,
  sections: Array<{ title: string; chapterTitle: string }>,
): number[] {
  if (sections.length === 0) return [];

  const weights = sections.map((s) => sectionWeight(s.title, s.chapterTitle));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  return weights.map((weight) =>
    // Never ask for fewer than 120 words: below that the instruction produces a
    // stub rather than a shorter section.
    Math.max(120, Math.round((weight / totalWeight) * budget.totalWords)),
  );
}

/** Estimated page count for text already written. */
export function estimatePages(words: number, formatting: ExportFormatting): number {
  return Math.max(1, Math.round(words / wordsPerPage(formatting)));
}
