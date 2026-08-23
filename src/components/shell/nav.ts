import {
  Download,
  History,
  LayoutDashboard,
  ListChecks,
  Library,
  Settings,
  SquarePen,
  Stethoscope,
  Telescope,
  type LucideIcon,
} from "lucide-react";

/**
 * Application navigation.
 *
 * Every entry here points at a route that exists. Items for features that
 * land in later milestones are deliberately absent rather than present and
 * inert — a nav link that goes nowhere is exactly the kind of decorative
 * shell the brief rules out.
 */

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Matched as a prefix so child routes keep the parent highlighted. */
  readonly match?: string;
}

/** Always available, regardless of which project is open. */
export const GLOBAL_NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Shown only while a project is open, scoped to that project.
 *
 * `/projects/[id]` is deliberately absent: it is a redirect that sends you to
 * whichever of these three you belong on, so as a nav entry it would appear to
 * do nothing from wherever you already were.
 */
export function projectNav(projectId: string): readonly NavItem[] {
  const base = `/projects/${projectId}`;
  /*
   * Ordered the way the work happens: describe it, review it, write it, then
   * everything you do to the result.
   *
   * Sources, health, history and export were all panels stacked on the
   * blueprint, which made that page a nine-thousand-pixel scroll and buried the
   * one thing it is actually for. Each answers a different question, so each is
   * a page — and listing them here is what makes them findable at all.
   */
  return [
    { href: `${base}/wizard/1`, label: "Setup", icon: ListChecks, match: `${base}/wizard` },
    { href: `${base}/blueprint`, label: "Blueprint", icon: Telescope },
    { href: `${base}/workspace`, label: "Workspace", icon: SquarePen },
    { href: `${base}/sources`, label: "Sources", icon: Library },
    { href: `${base}/health`, label: "Health", icon: Stethoscope },
    { href: `${base}/history`, label: "History", icon: History },
    { href: `${base}/export`, label: "Export", icon: Download },
  ];
}

/** The project id in the current path, or null outside a project. */
export function projectIdFromPath(pathname: string): string | null {
  const match = /^\/projects\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

/**
 * Whether a nav item is the active one.
 *
 * Exact match for index routes, prefix match otherwise — without the exact
 * case, "/projects/x" would stay lit while the user is on
 * "/projects/x/workspace" and two items would appear active at once.
 */
export function isActive(pathname: string, item: NavItem, exact: boolean): boolean {
  const target = item.match ?? item.href;
  return exact ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);
}
