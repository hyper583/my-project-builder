import { redirect } from "next/navigation";

import { requireProject } from "@/server/dal/projects";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]"> ) {
  const { id } = await params;
  const { project } = await requireProject(id);

  // Ownership has already been enforced above.
  // A draft resumes at its last wizard step; anything already assembled — the
  // sample project included — opens at the blueprint until the editing
  // workspace lands in Milestone B.
  if (project.status === "DRAFT") {
    redirect(`/projects/${id}/wizard/${project.wizardStep || 1}`);
  }
  redirect(`/projects/${id}/blueprint`);
}
