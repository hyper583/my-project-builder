import Link from "next/link";

import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { requireSession } from "@/server/dal/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Authorisation is enforced here and again in the DAL on every query —
  // never in proxy.ts, which Next 16 explicitly does not intend for auth.
  const user = await requireSession();

  return (
    <>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/dashboard" className="font-serif text-lg font-semibold tracking-tight">
            My Project Builder
          </Link>
          <div className="flex items-center gap-3">
            {user.role === "ADMIN" ? (
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Admin
              </span>
            ) : null}
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}
