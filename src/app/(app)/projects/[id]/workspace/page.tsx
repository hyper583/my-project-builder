import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { WorkspaceShell, type WorkspaceSection } from "@/components/workspace/workspace-shell";
import type { NavChapter } from "@/components/workspace/panels";
import type { ChatMessage } from "@/components/workspace/assistant-chat";
import { requireProject } from "@/server/dal/projects";
import { prisma } from "@/server/db";
import { aiConfigured } from "@/server/services/ai";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage({ params }: PageProps<"/projects/[id]/workspace">) {
  const { id } = await params;
  const { user } = await requireProject(id);

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      sections: {
        orderBy: [{ order: "asc" }],
        select: {
          id: true,
          parentId: true,
          number: true,
          title: true,
          content: true,
          _count: { select: { placeholders: { where: { resolved: false } } } },
        },
      },
    },
  });
  if (!project) notFound();

  const all = project.sections;

  const chapters: NavChapter[] = all
    .filter((s) => s.parentId === null)
    .map((chapter) => ({
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      hasContent: Boolean(chapter.content),
      placeholders: chapter._count.placeholders,
      children: all
        .filter((s) => s.parentId === chapter.id)
        .map((section) => ({
          id: section.id,
          number: section.number,
          title: section.title,
          hasContent: Boolean(section.content),
          placeholders: section._count.placeholders,
          children: [],
        })),
    }));

  // Only leaf sections are editable — a chapter is a container for them.
  //
  // Derived from the chapter tree rather than by sorting the flat list: `order`
  // is scoped to a parent, so a flat sort interleaves chapters and would open
  // the project on section 4.1 instead of 1.1.
  const byId = new Map(all.map((s) => [s.id, s]));
  const sections: WorkspaceSection[] = chapters.flatMap((chapter) =>
    chapter.children.map((child) => {
      const row = byId.get(child.id)!;
      return {
        id: row.id,
        number: row.number,
        title: row.title,
        content: row.content,
        placeholders: row._count.placeholders,
      };
    }),
  );

  // The transcript lives server-side, so a reload or a different device
  // continues the same conversation rather than starting a blank one.
  const conversation = await prisma.aIConversation.findFirst({
    where: { projectId: id, userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      messages: {
        where: { role: { in: ["USER", "ASSISTANT"] } },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: { id: true, role: true, content: true },
      },
    },
  });

  const initialMessages: ChatMessage[] = (conversation?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role === "USER" ? "USER" : "ASSISTANT",
    content: m.content,
  }));

  return (
    <WorkspaceShell
      projectId={project.id}
      projectTitle={project.title}
      chapters={chapters}
      sections={sections}
      aiConfigured={aiConfigured}
      initialMessages={initialMessages}
      initialConversationId={conversation?.id ?? null}
    />
  );
}
