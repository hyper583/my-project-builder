import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ExportPanel } from "@/components/export/export-panel";
import { ProjectPageHeader } from "@/components/projects/project-page-header";
import { requireProject } from "@/server/dal/projects";
import { prisma } from "@/server/db";
import { resolveExportPolicy } from "@/server/services/export/policy";

export const metadata: Metadata = { title: "Export" };

/**
 * Phrased for the student, keyed by the resolver's own reason codes.
 *
 * The keys must match `ExportPolicy.reason` exactly — a typo here silently
 * produces a blocked export with no explanation, which is worse than a blunt
 * one.
 */
const DENIAL: Record<string, string> = {
  DEMO_REQUIRES_PAID_PLAN:
    "Exporting a sample project is part of the paid plan. Upgrade to download it, " +
    "or create your own project and export that.",
  REAL_EXPORT_NOT_IN_PLAN:
    "Your project is written and yours to read here in full. Downloading it as a " +
    "Word or PDF document is part of the paid plan.",
  NOT_OWNER: "This project belongs to someone else.",
};

/**
 * Downloading the project as a document.
 *
 * The policy resolved here is the same one the export pipeline enforces, so
 * what this page promises and what a download actually does cannot drift apart.
 */
export default async function ProjectExportPage({ params }: PageProps<"/projects/[id]/export">) {
  const { id } = await params;
  const { project, user } = await requireProject(id);
  if (!project) notFound();

  const pass = await prisma.projectPass.findUnique({
    where: { projectId: project.id },
    select: { claimedAt: true },
  });

  const policy = resolveExportPolicy(
    { id: user.id, role: user.role, planTier: user.planTier },
    {
      id: project.id,
      kind: project.kind,
      ownerId: project.userId,
      hasPass: Boolean(pass?.claimedAt),
    },
  );

  // The honest count of what still needs the student's own data. Shown before
  // the download rather than discovered inside it.
  const placeholderCount = await prisma.sectionPlaceholder.count({
    where: { resolved: false, section: { projectId: id } },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <ProjectPageHeader projectId={id} projectTitle={project.title} section="Export">
        Download your project as a Word document or a PDF, with your headings, numbering,
        tables and references intact.
      </ProjectPageHeader>

      <div className="mt-8">
        <ExportPanel
          projectId={id}
          allowed={policy.allowed}
          denialReason={policy.allowed ? null : (DENIAL[policy.reason] ?? null)}
          willCarryDisclaimer={policy.allowed && policy.disclaimer}
          placeholderCount={placeholderCount}
        />
      </div>
    </div>
  );
}
