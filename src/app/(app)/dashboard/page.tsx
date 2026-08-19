import type { Metadata } from "next";

import { ProjectList, type ProjectCardData } from "@/components/dashboard/project-list";
import { listProjects } from "@/server/dal/projects";
import { requireSession } from "@/server/dal/session";

export const metadata: Metadata = { title: "My Projects" };

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value);
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireSession();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";

  const projects = await listProjects(query);

  const cards: ProjectCardData[] = projects.map((project) => ({
    id: project.id,
    title: project.title,
    topic: project.topic,
    kind: project.kind,
    status: project.status,
    completionPct: project.completionPct,
    lastGeneratedSection: project.lastGeneratedSection,
    updatedAt: formatDate(project.updatedAt),
    department: project.institution?.department ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">My Projects</h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Welcome back, {user.name.split(" ")[0]}. Your work saves as you go.
        </p>
      </div>
      <ProjectList projects={cards} query={query} />
    </div>
  );
}
