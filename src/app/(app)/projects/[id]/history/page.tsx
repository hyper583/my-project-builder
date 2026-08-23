import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectPageHeader } from "@/components/projects/project-page-header";
import { VersionHistory } from "@/components/versions/version-history";
import { requireProject } from "@/server/dal/projects";
import { listVersions } from "@/server/services/versions";

export const metadata: Metadata = { title: "History" };

/**
 * Saved versions of the project.
 *
 * Its own page because restoring one rewrites the document, and a control that
 * destructive should not sit three screens down a page someone was scrolling
 * past on their way to something else.
 */
export default async function ProjectHistoryPage({ params }: PageProps<"/projects/[id]/history">) {
  const { id } = await params;
  const { project } = await requireProject(id);
  if (!project) notFound();

  const versions = (await listVersions(id)).map((version) => ({
    id: version.id,
    number: version.number,
    label: version.label,
    createdAt: new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(version.createdAt),
    sectionCount: version.sectionCount,
    wordCount: version.wordCount,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <ProjectPageHeader projectId={id} projectTitle={project.title} section="History">
        A version is saved automatically before each generation run, and you can save one
        yourself at any point.
      </ProjectPageHeader>

      <div className="mt-8">
        <VersionHistory projectId={id} versions={versions} />
      </div>
    </div>
  );
}
