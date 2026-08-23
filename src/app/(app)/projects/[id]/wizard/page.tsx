import { redirect } from "next/navigation";

import { requireProject } from "@/server/dal/projects";

/**
 * Setup, without naming a step.
 *
 * The wizard's own pages live under `[step]`, so `/projects/[id]/wizard` had
 * no page and returned a 404. That was not a hypothetical address: the
 * breadcrumb builds each crumb from the path prefix it sits on, so **every
 * wizard page linked to it** — the trail on step 3 offered "Setup" as a way
 * back and produced a 404 when taken.
 *
 * Resuming at the saved step rather than at step 1 matches what
 * `/projects/[id]` already does for a draft, and is what the crumb means:
 * back to setup, where you left it.
 */
export default async function WizardIndexPage({
  params,
}: PageProps<"/projects/[id]/wizard">) {
  const { id } = await params;
  const { project } = await requireProject(id);

  redirect(`/projects/${id}/wizard/${project.wizardStep || 1}`);
}
