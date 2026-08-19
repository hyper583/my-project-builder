import { redirect } from "next/navigation";

import { requireProject } from "@/server/dal/projects";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const { project } = await requireProject(id);

  // Until the workspace lands (Milestone B), a draft resumes at its last
  // wizard step. Ownership has already been enforced above.
  redirect(`/projects/${id}/wizard/${project.wizardStep || 1}`);
}
