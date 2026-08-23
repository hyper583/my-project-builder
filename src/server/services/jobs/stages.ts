/**
 * Generation stages.
 *
 * The pipeline is staged rather than one enormous prompt: each stage is a
 * separate, cheaper call whose result is saved before the next begins. That is
 * what makes a run resumable — a failure at stage 8 never discards stages 1–7.
 *
 * Chapter stages are derived from the student's own structure, so a three- or
 * seven-chapter project produces the right stages rather than being forced into
 * a five-chapter assumption.
 */

export type StageKind = "analyse" | "outline" | "chapter" | "scaffold" | "references" | "consistency" | "finalise";

export interface Stage {
  readonly key: string;
  readonly label: string;
  readonly kind: StageKind;
  /** Set for chapter stages — the ProjectSection id of the chapter. */
  readonly chapterId?: string;
}

/**
 * Chapters that report the student's own findings.
 *
 * These are scaffolded with tracked placeholders instead of written, because
 * inventing results, response rates or test statistics is exactly what the
 * brief forbids. Matching on the title is a heuristic, so the scaffold stage
 * also states plainly what it did and why.
 */
const RESULTS_CHAPTER =
  /\b(results?|findings?|data\s+(presentation|analysis)|analysis\s+and\s+interpretation|presentation\s+(of|and)\s+(data|analysis|results?))\b/i;

/**
 * Chapter five, which discusses findings rather than reporting them.
 *
 * Checked first because it almost always contains the word "Findings" —
 * "Summary of Findings and Conclusion" is a common title — and scaffolding it
 * would answer a conclusion with "what this section will present once you add
 * your data", which is not what a conclusion is.
 */
const CONCLUDING_CHAPTER = /\b(summary|conclusion|recommendation)/i;

/**
 * Whether a chapter reports findings, and so must be scaffolded rather than
 * written.
 *
 * The previous pattern required singular words behind word boundaries —
 * `\bresult\b` cannot match "Results", because the boundary needs a non-word
 * character and `s` is not one. The effect was that **the default template's
 * own Chapter 4, "Results and Discussion", was never detected**, and neither
 * were "Presentation of Results", "Analysis of Findings" or "Findings and
 * Discussion". Only the singular "Result and Discussion" matched, which
 * essentially nobody writes, so the protection was inert for real projects.
 *
 * Nothing visibly failed, because the integrity rules in the system prompt
 * caught the fabrication anyway and emitted placeholders. That is the safety
 * net doing the job the design was supposed to do first.
 */
export function isResultsChapter(title: string): boolean {
  if (CONCLUDING_CHAPTER.test(title)) return false;
  return RESULTS_CHAPTER.test(title);
}

export interface ChapterInput {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
}

/** Fixed stages that always run, regardless of structure. */
/**
 * Source retrieval runs BEFORE any prose is written, and must stay there.
 *
 * It used to be the first epilogue stage, which meant every chapter was
 * written before a single source existed. The reading list that came back was
 * accurate and completely disconnected from the document it was attached to:
 * whatever citations appeared in the prose referred to nothing, because there
 * had been nothing to refer to. Moving it ahead of the writing is what lets
 * the model cite real, retrieved works instead.
 */
export const PROLOGUE_STAGES: readonly Stage[] = [
  { key: "analyse", label: "Analysing your project information", kind: "analyse" },
  { key: "references", label: "Finding published sources for your topic", kind: "references" },
  { key: "outline", label: "Confirming the project structure", kind: "outline" },
] as const;

export const EPILOGUE_STAGES: readonly Stage[] = [
  { key: "consistency", label: "Checking the project for contradictions", kind: "consistency" },
  { key: "finalise", label: "Preparing your project workspace", kind: "finalise" },
] as const;

export function buildStages(chapters: readonly ChapterInput[]): Stage[] {
  const chapterStages: Stage[] = chapters.map((chapter) => {
    const name = chapter.number ? `Chapter ${chapter.number}` : chapter.title;
    const scaffold = isResultsChapter(chapter.title);
    return {
      key: `chapter:${chapter.id}`,
      label: scaffold
        ? `Preparing ${name} for your own results`
        : `Writing ${name} — ${chapter.title}`,
      kind: scaffold ? "scaffold" : "chapter",
      chapterId: chapter.id,
    };
  });

  return [...PROLOGUE_STAGES, ...chapterStages, ...EPILOGUE_STAGES];
}

/**
 * The fixed stages alone, without any chapter work.
 *
 * Kept for callers that need the shape of a run rather than one project's, and
 * NOT used as a fallback for a chapter-less project. That was the original
 * intent and it was wrong: those stages all succeed while writing nothing, the
 * project is marked READY, and the run is spent. `enqueueGeneration` now
 * refuses such a project outright instead.
 */
export const GENERATION_STAGES: readonly Stage[] = [
  ...PROLOGUE_STAGES,
  ...EPILOGUE_STAGES,
] as const;
