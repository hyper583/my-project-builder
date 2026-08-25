import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ExportPanel } from "@/components/export/export-panel";
import { FrontMatterPanel } from "@/components/export/front-matter-panel";
import { ProjectPageHeader } from "@/components/projects/project-page-header";
import { requireProject } from "@/server/dal/projects";
import { prisma } from "@/server/db";
import { aiConfigured } from "@/server/services/ai";
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
    "This is the sample project, and it is here to be read rather than handed in. " +
    "Create your own project to write and download one.",
  REAL_EXPORT_NOT_IN_PLAN:
    "Your first chapter is written and yours to keep. A project pass writes the " +
    "remaining chapters and lets you download the finished document as Word or PDF.",
  NOT_OWNER: "This project belongs to someone else.",
};

/**
 * Which refusals a pass actually answers.
 *
 * Only one of them. The sample project is withheld because it is a sample, and
 * offering to sell a way round that would be selling something that does not
 * exist — buying a pass does not make the demo submittable, and it is
 * watermarked precisely so it cannot be.
 */
const ANSWERED_BY_A_PASS = new Set(["REAL_EXPORT_NOT_IN_PLAN"]);

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

  const [institution, frontMatter] = await Promise.all([
    prisma.projectInstitution.findUnique({
      where: { projectId: id },
      select: {
        matricNumber: true,
        supervisorName: true,
        supervisorTitle: true,
        headOfDepartment: true,
      },
    }),
    prisma.projectFrontMatter.findUnique({
      where: { projectId: id },
      select: { dedication: true, acknowledgements: true, abstract: true, keywords: true },
    }),
  ]);

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
          offerPass={!policy.allowed && ANSWERED_BY_A_PASS.has(policy.reason)}
          willCarryDisclaimer={policy.allowed && policy.disclaimer}
          placeholderCount={placeholderCount}
        />
      </div>

      {/*
        Offered only where the document is the student's own to hand in. The
        sample is a fixture with a fixed title page, and giving it a dedication
        would be furnishing something nobody submits.
      */}
      {project.kind === "REAL" ? (
        <div className="mt-6">
          <FrontMatterPanel
            projectId={id}
            aiConfigured={aiConfigured}
            initial={{
              matricNumber: institution?.matricNumber ?? "",
              supervisorName: institution?.supervisorName ?? "",
              supervisorTitle: institution?.supervisorTitle ?? "",
              headOfDepartment: institution?.headOfDepartment ?? "",
              dedication: frontMatter?.dedication ?? "",
              acknowledgements: frontMatter?.acknowledgements ?? "",
              abstract: frontMatter?.abstract ?? "",
              keywords: frontMatter?.keywords ?? "",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
