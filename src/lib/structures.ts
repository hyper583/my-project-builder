/**
 * Default chapter structures.
 *
 * Offered as starting points, never imposed — every chapter and section stays
 * renameable, reorderable and removable. They live here rather than in the
 * wizard component because the server needs them too: a student who types a
 * topic and presses generate has skipped the structure step, and generation
 * derives its stages from the project's chapters. Without a default there
 * would be nothing to generate.
 */

export interface StructureSection {
  title: string;
  number: string;
}

export interface StructureChapter {
  title: string;
  number: string;
  children: StructureSection[];
}

/** The common five-chapter shape used across much of West Africa and the UK. */
export const FIVE_CHAPTER_TEMPLATE: StructureChapter[] = [
  {
    title: "Introduction",
    number: "1",
    children: [
      { title: "Background to the Study", number: "1.1" },
      { title: "Statement of the Problem", number: "1.2" },
      { title: "Aim and Objectives", number: "1.3" },
      { title: "Research Questions", number: "1.4" },
      { title: "Significance of the Study", number: "1.5" },
      { title: "Scope and Limitations", number: "1.6" },
      { title: "Definition of Terms", number: "1.7" },
    ],
  },
  {
    title: "Literature Review",
    number: "2",
    children: [
      { title: "Conceptual Framework", number: "2.1" },
      { title: "Theoretical Framework", number: "2.2" },
      { title: "Empirical Review", number: "2.3" },
      { title: "Summary of Literature", number: "2.4" },
    ],
  },
  {
    title: "Research Methodology",
    number: "3",
    children: [
      { title: "Research Design", number: "3.1" },
      { title: "Population of the Study", number: "3.2" },
      { title: "Sample Size and Sampling Technique", number: "3.3" },
      { title: "Instrumentation", number: "3.4" },
      { title: "Method of Data Collection", number: "3.5" },
      { title: "Method of Data Analysis", number: "3.6" },
    ],
  },
  {
    title: "Results and Discussion",
    number: "4",
    children: [
      { title: "Presentation of Results", number: "4.1" },
      { title: "Analysis of Findings", number: "4.2" },
      { title: "Discussion of Findings", number: "4.3" },
    ],
  },
  {
    title: "Summary, Conclusion and Recommendations",
    number: "5",
    children: [
      { title: "Summary of Findings", number: "5.1" },
      { title: "Conclusion", number: "5.2" },
      { title: "Recommendations", number: "5.3" },
      { title: "Suggestions for Further Research", number: "5.4" },
    ],
  },
];

/**
 * A research proposal.
 *
 * Structurally different rather than merely shorter: a proposal is written
 * *before* the research happens, so it has no results, no findings and no
 * conclusions to draw. Its methodology chapter states what the student intends
 * to do rather than what they did. Handing a proposal the five-chapter shape
 * would invite exactly the fabrication the product refuses — results for a
 * study that has not been carried out.
 */
export const PROPOSAL_TEMPLATE: StructureChapter[] = [
  {
    title: "Introduction",
    number: "1",
    children: [
      { title: "Background to the Study", number: "1.1" },
      { title: "Statement of the Problem", number: "1.2" },
      { title: "Aim and Objectives", number: "1.3" },
      { title: "Research Questions", number: "1.4" },
      { title: "Significance of the Study", number: "1.5" },
      { title: "Scope of the Study", number: "1.6" },
    ],
  },
  {
    title: "Literature Review",
    number: "2",
    children: [
      { title: "Conceptual Framework", number: "2.1" },
      { title: "Theoretical Framework", number: "2.2" },
      { title: "Review of Related Studies", number: "2.3" },
      { title: "Gap in the Literature", number: "2.4" },
    ],
  },
  {
    title: "Proposed Methodology",
    number: "3",
    children: [
      { title: "Research Design", number: "3.1" },
      { title: "Population and Sampling", number: "3.2" },
      { title: "Proposed Instruments", number: "3.3" },
      { title: "Proposed Method of Data Collection", number: "3.4" },
      { title: "Proposed Method of Data Analysis", number: "3.5" },
      { title: "Expected Contribution", number: "3.6" },
      { title: "Work Plan and Timeline", number: "3.7" },
    ],
  },
];

const clone = (chapter: StructureChapter): StructureChapter => ({
  title: chapter.title,
  number: chapter.number,
  children: chapter.children.map((section) => ({ ...section })),
});

/**
 * Renumbers a chapter and its sections for a given position.
 *
 * Exported because reordering in the wizard needs it too: without renumbering
 * after a move, the display order and the chapter numbers disagree and the
 * blueprint reads "1, 3, 2".
 */
export function renumberChapter<
  // Generic over the chapter shape so the wizard's own type — which carries an
  // id and allows an absent number while editing — keeps its extra fields
  // instead of being flattened into this one.
  T extends { number?: string; children: Array<{ number?: string }> },
>(chapter: T, index: number): T {
  return {
    ...chapter,
    number: String(index + 1),
    children: chapter.children.map((section, j) => ({
      ...section,
      number: `${index + 1}.${j + 1}`,
    })),
  };
}

/**
 * A structure of `count` chapters.
 *
 * Dropping chapters keeps the ones that carry the argument: a four-chapter
 * project loses the separate results chapter, a three-chapter one keeps
 * introduction, methodology and conclusion. Chapters are renumbered so the
 * result is never a document that starts at 1 and jumps to 3.
 */
export function structureTemplate(count: number): StructureChapter[] {
  if (count >= 5) return FIVE_CHAPTER_TEMPLATE.slice(0, count).map(clone);

  if (count === 4) {
    return [
      FIVE_CHAPTER_TEMPLATE[0]!,
      FIVE_CHAPTER_TEMPLATE[1]!,
      FIVE_CHAPTER_TEMPLATE[2]!,
      FIVE_CHAPTER_TEMPLATE[4]!,
    ]
      .map(clone)
      .map(renumberChapter);
  }

  return [FIVE_CHAPTER_TEMPLATE[0]!, FIVE_CHAPTER_TEMPLATE[2]!, FIVE_CHAPTER_TEMPLATE[4]!]
    .map(clone)
    .map(renumberChapter);
}

/**
 * The structure to use when a student has not chosen one.
 *
 * Driven by project type rather than defaulting to five chapters for
 * everything, because the shape of the document is part of what the type
 * means — most obviously for a proposal, which has no results.
 */
export function defaultStructureFor(
  projectType: string | null | undefined,
  chapterCount?: number | null,
): StructureChapter[] {
  if (projectType === "project-proposal") return PROPOSAL_TEMPLATE.map(clone);
  if (chapterCount && chapterCount >= 3) return structureTemplate(chapterCount);

  // A research paper or seminar is normally shorter than a full project.
  if (projectType === "research-paper" || projectType === "seminar") {
    return structureTemplate(3);
  }

  return FIVE_CHAPTER_TEMPLATE.map(clone);
}
