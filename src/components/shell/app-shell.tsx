"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";

import { AccountMenu } from "@/components/shell/account-menu";
import {
  GLOBAL_NAV,
  isActive,
  projectIdFromPath,
  projectNav,
  type NavItem,
} from "@/components/shell/nav";
import { buildCommands, type PaletteProject } from "@/components/shell/commands";
import { PaletteScope, type PaletteContribution } from "@/components/shell/palette-scope";
import { Wordmark } from "@/components/shell/wordmark";
import { CommandPalette } from "@/components/ui/command-palette";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useTheme } from "@/components/theme/theme-provider";
import { usePersistedFlag } from "@/lib/use-client-store";

const SIDEBAR_STORAGE_KEY = "mpb-sidebar-collapsed";

export interface ShellUser {
  email: string;
  name: string | null;
  role: string;
  planTier: string;
}

/** Human labels for path segments that appear in the breadcrumb trail. */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  blueprint: "Blueprint",
  workspace: "Workspace",
  wizard: "Setup",
  settings: "Settings",
};

function buildCrumbs(pathname: string): Array<{ label: string; href: string | null }> {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; href: string | null }> = [];

  segments.forEach((segment, index) => {
    const known = SEGMENT_LABELS[segment];

    // Opaque ids and step numbers are not meaningful to a reader, so they are
    // dropped from the trail rather than shown as a cuid.
    if (!known) {
      const previous = segments[index - 1];
      if (previous === "projects" || previous === "wizard") return;
      return;
    }

    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const last = index === segments.length - 1;
    crumbs.push({ label: known, href: last ? null : href });
  });

  return crumbs;
}

/**
 * The application shell: a persistent sidebar, a top bar, and the palette.
 *
 * The sidebar collapses to an icon rail and remembers that choice. Inside the
 * workspace it is always collapsed, because the editor has its own section
 * navigator on the left and two stacked navigation columns compete for the
 * same job. That is derived from the route rather than pushed through state,
 * so the collapse control is disabled there instead of appearing to do
 * nothing.
 */
export function AppShell({
  user,
  projects,
  children,
}: {
  user: ShellUser;
  projects: readonly PaletteProject[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const projectId = projectIdFromPath(pathname);
  const inWorkspace = pathname.endsWith("/workspace");

  // Read straight from storage during render rather than restored in an
  // effect, so the sidebar never paints expanded and then snaps shut.
  const [preferCollapsed, setPreferCollapsed] = usePersistedFlag(SIDEBAR_STORAGE_KEY, false);

  // The workspace has its own section navigator on the left, so a second
  // expanded nav column would compete with it for the same job. Derived
  // rather than forced through state: no effect, and no route change that
  // has to remember to undo itself.
  const collapsed = inWorkspace || preferCollapsed;

  // The drawer is tied to the route it was opened on, so navigating away
  // closes it without an effect watching the pathname.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const mobileOpen = openedOn === pathname;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contribution, setContribution] = useState<PaletteContribution | null>(null);

  const toggleCollapsed = useCallback(
    () => setPreferCollapsed(!preferCollapsed),
    [preferCollapsed, setPreferCollapsed],
  );

  // Ctrl/Cmd-K from anywhere. Captured on the document so it works while focus
  // is inside the editor, and guarded so it never fights the browser's own
  // find-in-page or a native text field's shortcuts.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const scope = useMemo(() => ({ contribute: setContribution }), []);

  const crumbs = useMemo(() => buildCrumbs(pathname), [pathname]);
  const projectItems = useMemo(() => (projectId ? projectNav(projectId) : []), [projectId]);

  const commands = useMemo(
    () =>
      buildCommands({
        projects,
        projectId,
        sections: contribution?.sections ?? [],
        selectSection: contribution?.selectSection,
        navigate: (href) => router.push(href),
        setTheme,
      }),
    [projects, projectId, contribution, router, setTheme],
  );

  return (
    <PaletteScope.Provider value={scope}>
      <div className="flex min-h-0 flex-1">
        {/* Backdrop for the mobile drawer. */}
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpenedOn(null)}
            className="fade-in fixed inset-0 z-40 cursor-default bg-black/55 lg:hidden"
          />
        ) : null}

        <Sidebar
          collapsed={collapsed}
          forcedCollapsed={inWorkspace}
          mobileOpen={mobileOpen}
          pathname={pathname}
          projectItems={projectItems}
          onToggleCollapsed={toggleCollapsed}
          onCloseMobile={() => setOpenedOn(null)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/85 px-3 backdrop-blur-md sm:px-5">
            <button
              type="button"
              onClick={() => setOpenedOn(pathname)}
              aria-label="Open navigation"
              className="focus-glow flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground lg:hidden"
            >
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            </button>

            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex items-center gap-1.5 text-sm">
                {crumbs.map((crumb, index) => (
                  <li key={crumb.href ?? crumb.label} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 ? (
                      <ChevronRight
                        className="size-3.5 shrink-0 text-subtle-foreground"
                        aria-hidden="true"
                      />
                    ) : null}
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="truncate text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="truncate font-medium">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              {/*
               * The palette gets a visible control as well as the shortcut.
               * A keyboard surface nobody can discover is not a feature, and
               * the button is where people learn the shortcut exists.
               */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Open command palette"
                className="focus-glow group flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:text-foreground"
              >
                <Search className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden lg:inline">Search</span>
                <kbd className="mono hidden rounded border border-border px-1 py-0.5 text-[0.625rem] text-subtle-foreground lg:block">
                  ⌘K
                </kbd>
              </button>

              <ThemeToggle className="hidden sm:inline-flex" />
              <AccountMenu
                email={user.email}
                name={user.name}
                role={user.role}
                planTier={user.planTier}
              />
            </div>
          </header>

          <main id="main" className="flex min-h-0 flex-1 flex-col">
            {children}
          </main>
        </div>
      </div>

      {/* Mounted only while open, so each opening starts on a clean query. */}
      {paletteOpen ? (
        <CommandPalette onClose={() => setPaletteOpen(false)} commands={commands} />
      ) : null}
    </PaletteScope.Provider>
  );
}

function Sidebar({
  collapsed,
  forcedCollapsed,
  mobileOpen,
  pathname,
  projectItems,
  onToggleCollapsed,
  onCloseMobile,
}: {
  collapsed: boolean;
  forcedCollapsed: boolean;
  mobileOpen: boolean;
  pathname: string;
  projectItems: readonly NavItem[];
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
}) {
  // The drawer is always full width on mobile; `collapsed` is a desktop idea.
  const width = collapsed ? "lg:w-14" : "lg:w-60";

  return (
    <aside
      aria-label="Primary"
      className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:transition-[width] ${width} ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <Link
          href="/dashboard"
          className="focus-glow flex min-w-0 items-center rounded-md"
          title="My Project Builder"
        >
          <Wordmark nameClassName={collapsed ? "lg:hidden" : ""} />
        </Link>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="focus-glow ml-auto flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {GLOBAL_NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} pathname={pathname} collapsed={collapsed} exact={false} />
            </li>
          ))}
        </ul>

        {projectItems.length > 0 ? (
          <>
            <p className={`label-caps mt-6 mb-2 px-2.5 ${collapsed ? "lg:sr-only" : ""}`}>
              This project
            </p>
            <ul className="space-y-0.5">
              {projectItems.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} pathname={pathname} collapsed={collapsed} exact={false} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <Link
          href="/dashboard"
          title="New project"
          className={`focus-glow flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          <span className={collapsed ? "lg:hidden" : ""}>New project</span>
        </Link>

        <button
          type="button"
          onClick={onToggleCollapsed}
          disabled={forcedCollapsed}
          title={
            forcedCollapsed
              ? "The workspace uses its own section navigator"
              : collapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
          }
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`focus-glow hidden h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 lg:flex ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className={collapsed ? "lg:hidden" : ""}>Collapse</span>
        </button>

        <div className={`mt-2 px-1 sm:hidden ${collapsed ? "lg:hidden" : ""}`}>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  pathname,
  collapsed,
  exact,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  exact: boolean;
}) {
  const active = isActive(pathname, item, exact);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={`focus-glow relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150 ${
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      } ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
    >
      {/* The accent, used only to mark position. */}
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
      <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
    </Link>
  );
}
