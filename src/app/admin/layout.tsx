import type { Metadata } from "next";
import Link from "next/link";

import { MarkTile } from "@/components/shell/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireAdmin } from "@/server/dal/session";

export const metadata: Metadata = { title: "Operations" };

/**
 * The console's own sections.
 *
 * Kept here rather than in `nav.ts`: that table feeds the student sidebar and
 * the command palette, and an admin route appearing in either is exactly the
 * leak this console is unlinked to avoid.
 */
const ADMIN_NAV = [
  { href: "/admin", label: "Health" },
  { href: "/admin/users", label: "People" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/presets", label: "Presets" },
] as const;

/**
 * The admin console.
 *
 * Deliberately unlinked from the student interface. Admins reach it by typing
 * the URL; nothing anywhere hints it exists, and `requireAdmin()` throws
 * NOT_FOUND rather than a forbidden error, so probing the route tells an
 * attacker nothing about whether it is there.
 *
 * It has its own chrome rather than the student shell, because the two are
 * different products with different audiences, and sharing a sidebar would mean
 * the navigation had to know about roles — one more branch to get wrong, where
 * a rendering bug becomes an information leak instead of a cosmetic one.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Enforced here AND in every action. A layout guard alone protects the page
  // but not the server actions the page can reach.
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-5">
        <Link href="/admin" className="focus-glow flex items-center gap-2.5 rounded-md">
          <MarkTile />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.02em]">Operations</span>
        </Link>

        <span className="mono rounded-full border border-warning/40 bg-warning-subtle px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-warning uppercase">
          Admin
        </span>

        <nav aria-label="Admin sections" className="ml-3 flex items-center gap-1">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="focus-glow rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{admin.email}</span>
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="focus-glow rounded-md px-2 py-1 text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
          >
            Leave
          </Link>
        </div>
      </header>

      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
