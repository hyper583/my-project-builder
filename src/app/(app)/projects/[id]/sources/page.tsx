import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectPageHeader } from "@/components/projects/project-page-header";
import { ReferenceManager } from "@/components/references/reference-manager";
import { requireProject } from "@/server/dal/projects";
import { listReferences } from "@/server/services/references";

export const metadata: Metadata = { title: "Sources" };

/**
 * The project's references.
 *
 * Its own page rather than a panel on the blueprint, because a reference list
 * grows without bound — a project with sixty citations made the blueprint a
 * scroll nobody reached the bottom of, and buried the thing that page is
 * actually for.
 */
export default async function ProjectSourcesPage({ params }: PageProps<"/projects/[id]/sources">) {
  const { id } = await params;
  const { project } = await requireProject(id);
  if (!project) notFound();

  const references = await listReferences(id);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <ProjectPageHeader projectId={id} projectTitle={project.title} section="Sources">
        Every reference this project can cite. Bibliographic details are never invented —
        anything found for you is verified against a real publication.
      </ProjectPageHeader>

      <div className="mt-8">
        <ReferenceManager
          projectId={id}
          references={references.map((reference) => ({
            id: reference.id,
            authors: reference.authors,
            year: reference.year,
            title: reference.title,
            publication: reference.publication,
            volume: reference.volume,
            issue: reference.issue,
            pages: reference.pages,
            doi: reference.doi,
            url: reference.url,
            raw: reference.raw,
            verification: reference.verification,
            citationCount: reference.citationCount,
          }))}
        />
      </div>
    </div>
  );
}
