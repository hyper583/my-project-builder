import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/server/dal/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Authorisation is enforced here and again in the DAL on every query —
  // never in proxy.ts, which Next 16 explicitly does not intend for auth.
  const user = await requireSession();

  return (
    <AppShell
      user={{
        email: user.email,
        name: user.name,
        role: user.role,
        planTier: user.planTier,
      }}
    >
      {children}
    </AppShell>
  );
}
