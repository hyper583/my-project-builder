import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectHealthPanel } from "@/components/health/project-health";
import { ProjectPageHeader } from "@/components/projects/project-page-header";
import { requireProject } from "@/server/dal/projects";
import { listIssues } from "@/server/services/consistency";
import { computeHealth } from "@/server/services/health";

export const metadata: Metadata = { title: "Project health" };

/**
 * Contradictions and gaps found by checking the project against itself.
 *
 * Findings are shown for the student's decision. Nothing here edits their
 * research — a check that silently "fixed" a mismatched sample size would be
 * inventing the very data the product refuses to invent.
 */
export default async function ProjectHealthPage({ params }: PageProps<"/projects/[id]/health">) {
  const { id } = await params;
  const { project } = await requireProject(id);
  if (!project) notFound();

  const [health, openIssues, dismissedIssues] = await Promise.all([
    computeHealth(id),
    listIssues(id, "OPEN"),
    listIssues(id, "DISMISSED"),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <ProjectPageHeader projectId={id} projectTitle={project.title} section="Project health">
        What this project says against what it says elsewhere. Findings are yours to accept
        or dismiss — nothing is changed for you.
      </ProjectPageHeader>

      <div className="mt-8">
        <ProjectHealthPanel
          projectId={id}
          score={health.score}
          band={health.band}
          components={health.components}
          issues={openIssues.map((issue) => ({
            id: issue.id,
            kind: issue.kind,
            severity: issue.severity,
            status: issue.status,
            summary: issue.summary,
            detail: issue.detail,
            source: issue.source,
          }))}
          dismissedCount={dismissedIssues.length}
        />
      </div>
    </div>
  );
}
