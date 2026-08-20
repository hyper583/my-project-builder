import { AppError } from "@/server/errors";
import { prisma } from "@/server/db";
import { runChecks } from "@/server/services/consistency/checks";

/**
 * The consistency engine.
 *
 * Runs the deterministic checks over a project and reconciles the result with
 * what is already recorded. Three rules govern that reconciliation, and each
 * exists because of how a student actually uses this:
 *
 * - A finding is identified by its fingerprint, so re-running updates the
 *   existing row instead of piling up duplicates.
 * - A finding the student dismissed stays dismissed. Overruling that on every
 *   run would train them to ignore the panel entirely.
 * - A finding that no longer appears is marked resolved rather than deleted,
 *   so the panel can show that something was fixed instead of silently
 *   dropping it.
 */

export interface AnalysisResult {
  opened: number;
  resolved: number;
  stillOpen: number;
}

/** Reads everything the checks need in one pass. */
async function loadProject(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      research: {
        select: {
          aim: true,
          objectives: true,
          researchQuestions: true,
          hypotheses: true,
          sampleSize: true,
          targetPopulation: true,
          researchDesign: true,
        },
      },
      sections: {
        select: { id: true, parentId: true, number: true, title: true, content: true },
      },
      references: { select: { id: true, title: true, verification: true } },
      citations: { select: { referenceId: true } },
    },
  });

  if (!project) throw new AppError("NOT_FOUND");
  return project;
}

/** Runs the checks and reconciles the findings with what is stored. */
export async function analyseProject(projectId: string): Promise<AnalysisResult> {
  const project = await loadProject(projectId);

  const findings = runChecks({
    research: project.research,
    sections: project.sections,
    references: project.references,
    citedReferenceIds: project.citations.map((citation) => citation.referenceId),
  });

  const existing = await prisma.consistencyIssue.findMany({
    where: { projectId, source: "CHECK" },
    select: { id: true, fingerprint: true, status: true },
  });

  const byFingerprint = new Map(existing.map((issue) => [issue.fingerprint, issue]));
  const seen = new Set(findings.map((finding) => finding.fingerprint));

  let opened = 0;

  for (const finding of findings) {
    const previous = byFingerprint.get(finding.fingerprint);

    if (!previous) opened += 1;

    await prisma.consistencyIssue.upsert({
      where: { projectId_fingerprint: { projectId, fingerprint: finding.fingerprint } },
      create: {
        projectId,
        kind: finding.kind,
        source: "CHECK",
        severity: finding.severity,
        summary: finding.summary,
        detail: finding.detail,
        sectionIds: finding.sectionIds,
        fingerprint: finding.fingerprint,
      },
      update: {
        severity: finding.severity,
        summary: finding.summary,
        detail: finding.detail,
        sectionIds: finding.sectionIds,
        // A dismissed finding is left dismissed; anything else that is still
        // true is reopened, because it describes the document as it stands.
        status: previous?.status === "DISMISSED" ? "DISMISSED" : "OPEN",
      },
    });
  }

  const goneIds = existing
    .filter((issue) => !seen.has(issue.fingerprint) && issue.status === "OPEN")
    .map((issue) => issue.id);

  if (goneIds.length > 0) {
    await prisma.consistencyIssue.updateMany({
      where: { id: { in: goneIds } },
      data: { status: "RESOLVED" },
    });
  }

  const stillOpen = await prisma.consistencyIssue.count({
    where: { projectId, status: "OPEN" },
  });

  return { opened, resolved: goneIds.length, stillOpen };
}

export type IssueStatusFilter = "OPEN" | "DISMISSED" | "RESOLVED";

/** Findings for the panel, most serious first. */
export async function listIssues(projectId: string, status: IssueStatusFilter = "OPEN") {
  return prisma.consistencyIssue.findMany({
    where: { projectId, status },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      kind: true,
      severity: true,
      status: true,
      summary: true,
      detail: true,
      sectionIds: true,
      source: true,
      updatedAt: true,
    },
  });
}

/**
 * Sets a finding's status.
 *
 * Scoped to the project so an id from elsewhere cannot be updated, and the
 * only transitions offered are the student's own judgement — nothing here
 * edits their research.
 */
export async function setIssueStatus(
  projectId: string,
  issueId: string,
  status: "OPEN" | "DISMISSED",
): Promise<void> {
  const updated = await prisma.consistencyIssue.updateMany({
    where: { id: issueId, projectId },
    data: { status },
  });

  if (updated.count === 0) throw new AppError("NOT_FOUND");
}
