import { prisma } from "@/server/db";

/**
 * Project Health.
 *
 * A single figure plus the components behind it, because a bare score is not
 * actionable — a student needs to know which part is dragging it down.
 *
 * Two decisions shape the arithmetic:
 *
 * Outstanding markers are weighted heavily. A project can be complete in every
 * other respect and still be unsubmittable because its results are missing,
 * and the whole point of the markers is that this stays visible rather than
 * being papered over by a comfortable percentage.
 *
 * The score is never rounded up to flatter. A project with real problems
 * should read as having them: the number exists to be useful to the student,
 * not to reassure them.
 */

export type HealthBand = "NEEDS_WORK" | "IN_PROGRESS" | "STRONG";

export interface HealthComponent {
  key: string;
  label: string;
  /** 0–100 for this component. */
  score: number;
  /** Share of the overall score. */
  weight: number;
  detail: string;
}

export interface ProjectHealth {
  score: number;
  band: HealthBand;
  components: HealthComponent[];
  counts: {
    sections: number;
    writtenSections: number;
    words: number;
    placeholders: number;
    openIssues: number;
    highIssues: number;
    references: number;
    unverifiedReferences: number;
  };
}

function band(score: number): HealthBand {
  if (score >= 80) return "STRONG";
  if (score >= 50) return "IN_PROGRESS";
  return "NEEDS_WORK";
}

export async function computeHealth(projectId: string): Promise<ProjectHealth> {
  const [project, sections, placeholders, issues, references, unverifiedReferences] =
    await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { completionPct: true },
      }),
      prisma.projectSection.findMany({
        where: { projectId, parentId: { not: null } },
        select: { content: true, wordCount: true },
      }),
      prisma.sectionPlaceholder.count({
        where: { resolved: false, section: { projectId } },
      }),
      prisma.consistencyIssue.findMany({
        where: { projectId, status: "OPEN" },
        select: { severity: true },
      }),
      prisma.projectReference.count({ where: { projectId } }),
      prisma.projectReference.count({
        where: { projectId, verification: { not: "VERIFIED" } },
      }),
    ]);

  const writtenSections = sections.filter((section) => (section.content ?? "").trim().length > 0);
  const words = sections.reduce((sum, section) => sum + (section.wordCount ?? 0), 0);
  const highIssues = issues.filter((issue) => issue.severity === "HIGH").length;

  /* ---- Setup ------------------------------------------------------------- */

  const setupScore = project?.completionPct ?? 0;

  /* ---- Written ----------------------------------------------------------- */

  const writtenScore =
    sections.length === 0
      ? 0
      : Math.round((writtenSections.length / sections.length) * 100);

  /* ---- Your own data ------------------------------------------------------ */

  /*
   * Each outstanding marker costs 12 points. A handful is normal mid-project;
   * a document full of them is not close to submittable, and the score should
   * say so rather than sitting comfortably in the seventies.
   */
  const dataScore = Math.max(0, 100 - placeholders * 12);

  /* ---- Consistency -------------------------------------------------------- */

  const consistencyScore = Math.max(
    0,
    100 - highIssues * 20 - (issues.length - highIssues) * 6,
  );

  /* ---- References --------------------------------------------------------- */

  const referenceScore =
    references === 0
      ? 0
      : Math.round(((references - unverifiedReferences) / references) * 100);

  const components: HealthComponent[] = [
    {
      key: "setup",
      label: "Project setup",
      score: setupScore,
      weight: 0.2,
      detail: `${setupScore}% of the setup steps have something recorded.`,
    },
    {
      key: "written",
      label: "Sections written",
      score: writtenScore,
      weight: 0.25,
      detail:
        sections.length === 0
          ? "No sections yet — choose a chapter structure to begin."
          : `${writtenSections.length} of ${sections.length} sections have text.`,
    },
    {
      key: "data",
      label: "Your own data",
      score: dataScore,
      weight: 0.3,
      detail:
        placeholders === 0
          ? "Nothing is waiting on your results or figures."
          : `${placeholders} ${placeholders === 1 ? "place still needs" : "places still need"} your real data.`,
    },
    {
      key: "consistency",
      label: "Consistency",
      score: consistencyScore,
      weight: 0.15,
      detail:
        issues.length === 0
          ? "No open findings."
          : `${issues.length} open ${issues.length === 1 ? "finding" : "findings"}` +
            (highIssues > 0 ? `, ${highIssues} serious.` : "."),
    },
    {
      key: "references",
      label: "References",
      score: referenceScore,
      weight: 0.1,
      detail:
        references === 0
          ? "No references added yet."
          : `${references - unverifiedReferences} of ${references} confirmed.`,
    },
  ];

  // Floor rather than round: a project is never credited with a point it has
  // not earned.
  const score = Math.floor(
    components.reduce((sum, component) => sum + component.score * component.weight, 0),
  );

  return {
    score,
    band: band(score),
    components,
    counts: {
      sections: sections.length,
      writtenSections: writtenSections.length,
      words,
      placeholders,
      openIssues: issues.length,
      highIssues,
      references,
      unverifiedReferences,
    },
  };
}
