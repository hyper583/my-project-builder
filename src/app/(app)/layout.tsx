import { AppShell } from "@/components/shell/app-shell";
import { listProjects } from "@/server/dal/projects";
import { requireSession } from "@/server/dal/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Authorisation is enforced here and again in the DAL on every query —
  // never in proxy.ts, which Next 16 explicitly does not intend for auth.
  const user = await requireSession();

  // Feeds the command palette. `listProjects` is `cache()`-wrapped and already
  // scoped to the session's user, so this costs nothing extra on the dashboard
  // — the empty-string argument matches the key that page already uses.
  const projects = await listProjects("");

  return (
    <AppShell
      user={{
        email: user.email,
        name: user.name,
        role: user.role,
        planTier: user.planTier,
      }}
      projects={projects.map((project) => ({
        id: project.id,
        title: project.title,
        status: project.status,
        kind: project.kind,
      }))}
    >
      {children}
    </AppShell>
  );
}
