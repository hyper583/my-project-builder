import {
  FileText,
  LayoutDashboard,
  Settings,
  SquarePen,
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

/** Shown only while a project is open, scoped to that project. */
export function projectNav(projectId: string): readonly NavItem[] {
  const base = `/projects/${projectId}`;
  return [
    { href: base, label: "Overview", icon: FileText },
    { href: `${base}/blueprint`, label: "Blueprint", icon: Telescope },
    { href: `${base}/workspace`, label: "Workspace", icon: SquarePen },
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
