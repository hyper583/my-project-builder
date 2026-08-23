"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  FolderOpen,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";

import { MarkTile } from "@/components/shell/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * The console's own sections.
 *
 * Kept here rather than in `nav.ts` on purpose: that table feeds the student
 * sidebar and the command palette, and an admin route appearing in either is
 * exactly the leak this console stays unlinked to avoid.
 */
const ADMIN_NAV: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/health", label: "Health", icon: Activity },
  { href: "/admin/users", label: "People", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: FolderOpen },
  { href: "/admin/presets", label: "Presets", icon: Building2 },
];

/**
 * Chrome for the admin console.
 *
 * A sidebar rather than a row of links in the top bar: the console has five
 * sections now and will grow, and a horizontal strip stops being readable well
 * before a vertical one does.
 *
 * Sticky and full height for the reason the student sidebar is — several of
 * these pages run to thousands of pixels, and navigation that scrolls away
 * leaves nowhere to go from the bottom of a long list.
 */
export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label="Admin sections"
        className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start"
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <MarkTile />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.02em]">Operations</span>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {ADMIN_NAV.map((item) => {
              // Exact for the index, prefix for the rest — otherwise "/admin"
              // stays lit on every page beneath it and two items look active.
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`focus-glow relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150 ${
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 bottom-1.5 -left-2 w-0.5 rounded-full bg-primary"
                      />
                    ) : null}
                    <Icon
                      className={`size-4 shrink-0 ${active ? "text-primary" : ""}`}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          <p className="mono truncate text-[0.625rem] text-subtle-foreground">{email}</p>
          <Link
            href="/dashboard"
            className="focus-glow mt-2 inline-block rounded-md text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
          >
            Leave the console
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
         * Below `lg` the sidebar is replaced by a scrolling strip rather than a
         * drawer. The console is a desktop tool used occasionally on a phone;
         * a drawer would be more machinery than the case deserves.
         */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <MarkTile />
          <nav aria-label="Admin sections" className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex items-center gap-1">
              {ADMIN_NAV.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`focus-glow block rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors duration-150 ${
                        active ? "bg-muted font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <ThemeToggle />
        </header>

        {/* The theme toggle lives here on desktop, where the sidebar has no
            room for it without competing with navigation. */}
        <div className="hidden justify-end border-b border-border px-6 py-2.5 lg:flex">
          <span className="mono flex items-center gap-3 rounded-full border border-warning/40 bg-warning-subtle px-2.5 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-warning uppercase">
            Admin console
          </span>
          <span className="ml-3">
            <ThemeToggle />
          </span>
        </div>

        <main id="main" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
