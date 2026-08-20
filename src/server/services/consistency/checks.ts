import { findPlaceholders } from "@/lib/placeholders";

/**
 * Deterministic consistency checks.
 *
 * These are the backbone of the consistency engine, and they run without a
 * model: they are free, instant, repeatable, and they cannot hallucinate a
 * problem that is not there. A language pass over the prose is a separate,
 * optional enrichment — it finds different things, but it costs money, varies
 * between runs, and must never be the only thing standing between a student
 * and a contradiction a supervisor will notice.
 *
 * Every check raises a question. None of them edits the student's research.
 */

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export interface Finding {
  /** Stable machine key for the rule that produced this. */
  kind: string;
  severity: Severity;
  summary: string;
  detail: string;
  sectionIds: string[];
  /**
   * Stable identity for this specific finding.
   *
   * Re-running the checks updates the matching row rather than creating a
   * duplicate, which is also what lets a dismissed finding stay dismissed.
   * It must therefore describe the problem, not the moment it was found.
   */
  fingerprint: string;
}

export interface CheckInput {
  research: {
    aim: string | null;
    objectives: string[];
    researchQuestions: string[];
    hypotheses: string[];
    sampleSize: string | null;
    targetPopulation: string | null;
    researchDesign: string | null;
  } | null;
  sections: Array<{
    id: string;
    parentId: string | null;
    number: string | null;
    title: string;
    content: string | null;
  }>;
  references: Array<{ id: string; title: string; verification: string }>;
  citedReferenceIds: string[];
}

/** Strips HTML tags so prose can be searched as text. */
function toText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Numbers a sentence presents as a sample size.
 *
 * Deliberately narrow: only digits that sit next to sampling vocabulary count.
 * Matching every number in the prose would flag years, page counts and Likert
 * points, and a check that cries wolf gets ignored — which is worse than not
 * having it.
 */
function sampleSizeMentions(text: string): number[] {
  const pattern =
    /(?:sample(?:\s+size)?|respondents?|participants?|questionnaires?|students?\s+were\s+(?:sampled|selected|surveyed))[^.]{0,60}?(\d{2,6})|(\d{2,6})\s+(?:respondents?|participants?|students?\s+were\s+(?:sampled|selected|surveyed))/gi;

  const found: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = Number(match[1] ?? match[2]);
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

export function runChecks(input: CheckInput): Finding[] {
  const findings: Finding[] = [];
  const research = input.research;

  /* ---- Objectives and research questions ------------------------------- */

  if (research && research.objectives.length > 0 && research.researchQuestions.length > 0) {
    if (research.objectives.length !== research.researchQuestions.length) {
      findings.push({
        kind: "OBJECTIVES_QUESTIONS_MISMATCH",
        severity: "HIGH",
        summary: "Your objectives and research questions do not line up",
        detail:
          `You have ${research.objectives.length} objectives and ` +
          `${research.researchQuestions.length} research questions. Supervisors usually expect ` +
          "one question per objective. If a question deliberately covers more than one " +
          "objective, say so in the text — otherwise one of them is likely missing.",
        sectionIds: [],
        fingerprint: `OBJECTIVES_QUESTIONS_MISMATCH:${research.objectives.length}:${research.researchQuestions.length}`,
      });
    }
  }

  if (research && research.objectives.length > 0 && !research.aim?.trim()) {
    findings.push({
      kind: "OBJECTIVES_WITHOUT_AIM",
      severity: "MEDIUM",
      summary: "You have objectives but no stated aim",
      detail:
        "Objectives are normally read as the steps towards a single aim. Without the aim, " +
        "a reader cannot tell what the objectives are in service of.",
      sectionIds: [],
      fingerprint: "OBJECTIVES_WITHOUT_AIM",
    });
  }

  /* ---- Sample size stated once, written differently --------------------- */

  if (research?.sampleSize) {
    const stated = Number((research.sampleSize.match(/\d{2,6}/) ?? [])[0]);

    if (Number.isFinite(stated)) {
      for (const section of input.sections) {
        const mentions = sampleSizeMentions(toText(section.content));
        const contradiction = mentions.find((value) => value !== stated);

        if (contradiction !== undefined) {
          findings.push({
            kind: "SAMPLE_SIZE_CONTRADICTION",
            severity: "HIGH",
            summary: `Sample size differs between your setup and ${section.number ?? section.title}`,
            detail:
              `Your project details record a sample size of ${stated}, but this section ` +
              `mentions ${contradiction}. One of the two is wrong, and a supervisor reading ` +
              "both will notice. Nothing has been changed — decide which is correct.",
            sectionIds: [section.id],
            fingerprint: `SAMPLE_SIZE_CONTRADICTION:${section.id}:${stated}:${contradiction}`,
          });
        }
      }
    }
  }

  /* ---- Outstanding markers ---------------------------------------------- */

  const sectionsWithMarkers = input.sections.filter(
    (section) => findPlaceholders(toText(section.content)).length > 0,
  );

  if (sectionsWithMarkers.length > 0) {
    const total = sectionsWithMarkers.reduce(
      (sum, section) => sum + findPlaceholders(toText(section.content)).length,
      0,
    );
    findings.push({
      kind: "OUTSTANDING_PLACEHOLDERS",
      severity: "HIGH",
      summary: `${total} ${total === 1 ? "place needs" : "places need"} your own data`,
      detail:
        `Across ${sectionsWithMarkers.length} ` +
        `${sectionsWithMarkers.length === 1 ? "section" : "sections"}, the document marks where ` +
        "your real results, figures or observations belong. These are never filled in for you, " +
        "and they appear in the exported file until you replace them.",
      sectionIds: sectionsWithMarkers.map((section) => section.id),
      fingerprint: "OUTSTANDING_PLACEHOLDERS",
    });
  }

  /* ---- Empty sections ---------------------------------------------------- */

  const empty = input.sections.filter(
    (section) => section.parentId !== null && toText(section.content).length === 0,
  );

  if (empty.length > 0) {
    findings.push({
      kind: "EMPTY_SECTIONS",
      severity: "MEDIUM",
      summary: `${empty.length} ${empty.length === 1 ? "section is" : "sections are"} still empty`,
      detail:
        "These sections exist in your structure but have no text yet: " +
        empty
          .slice(0, 8)
          .map((section) => [section.number, section.title].filter(Boolean).join(" "))
          .join("; ") +
        (empty.length > 8 ? `; and ${empty.length - 8} more.` : "."),
      sectionIds: empty.map((section) => section.id),
      fingerprint: "EMPTY_SECTIONS",
    });
  }

  /* ---- Chapter numbering ------------------------------------------------- */

  const chapterNumbers = input.sections
    .filter((section) => section.parentId === null && section.number)
    .map((section) => Number(section.number))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const gaps = chapterNumbers.filter(
    (value, index) => index > 0 && value !== chapterNumbers[index - 1]! + 1,
  );

  if (gaps.length > 0) {
    findings.push({
      kind: "CHAPTER_NUMBERING_GAP",
      severity: "LOW",
      summary: "Your chapter numbering skips a number",
      detail:
        `Chapters run ${chapterNumbers.join(", ")}. This is fine if it is deliberate, but it ` +
        "is usually a chapter that was deleted without renumbering the rest.",
      sectionIds: [],
      fingerprint: `CHAPTER_NUMBERING_GAP:${chapterNumbers.join(",")}`,
    });
  }

  /* ---- References -------------------------------------------------------- */

  const unverified = input.references.filter((reference) => reference.verification !== "VERIFIED");

  if (unverified.length > 0) {
    findings.push({
      kind: "REFERENCES_NEED_REVIEW",
      severity: "MEDIUM",
      summary: `${unverified.length} ${unverified.length === 1 ? "reference needs" : "references need"} checking`,
      detail:
        "These entries have details that could not be confirmed, so they are marked for your " +
        "review rather than presented as verified. Check them against the original source " +
        "before submitting — publication data is never invented for you.",
      sectionIds: [],
      fingerprint: `REFERENCES_NEED_REVIEW:${unverified.length}`,
    });
  }

  const cited = new Set(input.citedReferenceIds);
  const uncited = input.references.filter((reference) => !cited.has(reference.id));

  if (uncited.length > 0 && input.references.length > 0) {
    findings.push({
      kind: "UNCITED_REFERENCES",
      severity: "LOW",
      summary: `${uncited.length} ${uncited.length === 1 ? "reference is" : "references are"} never cited`,
      detail:
        "A reference list should normally contain only works cited in the text: " +
        uncited
          .slice(0, 5)
          .map((reference) => reference.title)
          .join("; ") +
        (uncited.length > 5 ? `; and ${uncited.length - 5} more.` : "."),
      sectionIds: [],
      fingerprint: `UNCITED_REFERENCES:${uncited.length}`,
    });
  }

  return findings;
}
