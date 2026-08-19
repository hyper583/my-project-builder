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
const RESULTS_CHAPTER = /\b(result|finding|data\s+(presentation|analysis)|analysis and interpretation|presentation of data)\b/i;

export function isResultsChapter(title: string): boolean {
  return RESULTS_CHAPTER.test(title);
}

export interface ChapterInput {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
}

/** Fixed stages that always run, regardless of structure. */
export const PROLOGUE_STAGES: readonly Stage[] = [
  { key: "analyse", label: "Analysing your project information", kind: "analyse" },
  { key: "outline", label: "Confirming the project structure", kind: "outline" },
] as const;

export const EPILOGUE_STAGES: readonly Stage[] = [
  { key: "references", label: "Assembling references from your sources", kind: "references" },
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
 * Fallback used when a project has no chapters yet. Keeps the queue honest —
 * it still produces real stages rather than pretending work happened.
 */
export const GENERATION_STAGES: readonly Stage[] = [
  ...PROLOGUE_STAGES,
  ...EPILOGUE_STAGES,
] as const;
