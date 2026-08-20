import {
  FileText,
  FolderOpen,
  Monitor,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { GLOBAL_NAV, projectNav } from "@/components/shell/nav";
import type { Theme } from "@/lib/theme";

/**
 * The command list.
 *
 * Built from the same `nav.ts` tables the sidebar renders, never a second copy
 * of the route map — two lists of routes drift, and the one nobody looks at
 * drifts first.
 *
 * Every command here does something that already exists. There is no
 * "coming soon" row: a palette is a promise that what it lists is reachable,
 * and one dead entry costs the user their trust in all of them.
 */

export interface Command {
  readonly id: string;
  readonly label: string;
  /** Secondary text, right-aligned — a status, a section number, a shortcut. */
  readonly hint?: string;
  readonly group: string;
  readonly icon: LucideIcon;
  /** Extra words that should match this command without being displayed. */
  readonly keywords?: string;
  readonly run: () => void;
}

export interface PaletteProject {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly kind: string;
}

export interface PaletteSection {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
}

export interface CommandContext {
  readonly projects: readonly PaletteProject[];
  /** The project currently open, if any — its own routes are offered first. */
  readonly projectId: string | null;
  /** Sections of the open project. Only the workspace knows these. */
  readonly sections: readonly PaletteSection[];
  readonly navigate: (href: string) => void;
  readonly setTheme: (theme: Theme) => void;
  /** Jumps to a section within the already-open workspace. */
  readonly selectSection?: (id: string) => void;
}

export function buildCommands(context: CommandContext): Command[] {
  const commands: Command[] = [];

  // This project first: when you are inside one, its routes are what you
  // almost certainly want, and they are the ones that change as you move.
  if (context.projectId) {
    for (const item of projectNav(context.projectId)) {
      commands.push({
        id: `project-nav:${item.href}`,
        label: item.label,
        group: "This project",
        icon: item.icon,
        run: () => context.navigate(item.href),
      });
    }
  }

  // Sections are only known inside the workspace, where jumping is in-page.
  if (context.selectSection) {
    for (const section of context.sections) {
      commands.push({
        id: `section:${section.id}`,
        label: section.title,
        hint: section.number ?? undefined,
        group: "Go to section",
        icon: FileText,
        keywords: section.number ?? "",
        run: () => context.selectSection?.(section.id),
      });
    }
  }

  for (const project of context.projects) {
    // The open project is already covered by "This project" above.
    if (project.id === context.projectId) continue;
    commands.push({
      id: `project:${project.id}`,
      label: project.title,
      hint: project.kind === "DEMO" ? "Sample" : statusLabel(project.status),
      group: "Projects",
      icon: FolderOpen,
      keywords: project.status,
      run: () => context.navigate(`/projects/${project.id}`),
    });
  }

  for (const item of GLOBAL_NAV) {
    commands.push({
      id: `nav:${item.href}`,
      label: item.label,
      group: "Go to",
      icon: item.icon,
      run: () => context.navigate(item.href),
    });
  }

  const themes: Array<[Theme, string, LucideIcon]> = [
    ["dark", "Dark", Moon],
    ["light", "Light", Sun],
    ["system", "Match system", Monitor],
  ];
  for (const [value, label, icon] of themes) {
    commands.push({
      id: `theme:${value}`,
      label: `Theme: ${label}`,
      group: "Appearance",
      icon,
      keywords: "theme appearance dark light mode colour color",
      run: () => context.setTheme(value),
    });
  }

  return commands;
}

function statusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Setup";
    case "GENERATING":
      return "Generating";
    case "READY":
      return "Ready";
    case "ARCHIVED":
      return "Archived";
    default:
      return "";
  }
}

/**
 * Ranks commands against what has been typed.
 *
 * Substring first, then subsequence — typing "wsp" should still find
 * "Workspace" — with earlier and word-initial matches ranked above later ones.
 * Deliberately not a fuzzy library: the corpus is a few dozen short labels,
 * and a scoring function nobody can predict is worse than one that is merely
 * simple.
 */
export function rankCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...commands];

  const scored: Array<{ command: Command; score: number }> = [];

  for (const command of commands) {
    const label = command.label.toLowerCase();
    const haystack = `${label} ${command.keywords ?? ""} ${command.group.toLowerCase()}`;

    const direct = label.indexOf(q);
    if (direct === 0) {
      scored.push({ command, score: 1000 });
      continue;
    }
    if (direct > 0) {
      // A match at a word boundary beats one buried inside a word.
      const boundary = label[direct - 1] === " " ? 800 : 600;
      scored.push({ command, score: boundary - direct });
      continue;
    }
    if (haystack.includes(q)) {
      scored.push({ command, score: 400 });
      continue;
    }

    const subsequence = scoreSubsequence(label, q);
    if (subsequence !== null) scored.push({ command, score: subsequence });
  }

  // Stable within a score so groups keep the order they were built in.
  return scored
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}

/** Every query character present in order, scored by how tightly packed. */
function scoreSubsequence(text: string, query: string): number | null {
  let cursor = 0;
  let first = -1;
  let last = 0;

  for (const character of query) {
    const found = text.indexOf(character, cursor);
    if (found === -1) return null;
    if (first === -1) first = found;
    last = found;
    cursor = found + 1;
  }

  const spread = last - first;
  return Math.max(1, 300 - spread * 4 - first);
}
