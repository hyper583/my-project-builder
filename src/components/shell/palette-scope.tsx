"use client";

import { createContext, useContext, useEffect } from "react";

import type { PaletteSection } from "@/components/shell/commands";

/**
 * Lets a page contribute commands to the palette in the shell above it.
 *
 * The workspace is the only page that knows its own sections, and the palette
 * lives in the shell, which does not. Rather than lifting section state up
 * into the layout — where it would be fetched for every route that does not
 * need it — the page registers what it has while it is mounted and withdraws
 * it on the way out.
 *
 * Registration carries its own handler because jumping to a section inside the
 * open workspace is a state change, not a navigation: routing to it would
 * reload the editor and discard unsaved work.
 */

export interface PaletteContribution {
  readonly sections: readonly PaletteSection[];
  readonly selectSection: (id: string) => void;
}

export const PaletteScope = createContext<{
  contribute: (contribution: PaletteContribution | null) => void;
} | null>(null);

/**
 * Registers sections for as long as the caller is mounted.
 *
 * Both arguments must be referentially stable — a fresh array or an inline
 * arrow on every render would re-register in a loop. Callers memoise.
 */
export function useRegisterSections(
  sections: readonly PaletteSection[],
  selectSection: (id: string) => void,
) {
  const scope = useContext(PaletteScope);

  useEffect(() => {
    if (!scope) return;
    scope.contribute({ sections, selectSection });
    return () => scope.contribute(null);
  }, [scope, sections, selectSection]);
}
