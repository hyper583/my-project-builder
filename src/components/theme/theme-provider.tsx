"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

import { usePrefersDark } from "@/lib/use-client-store";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

/**
 * Theme control.
 *
 * Three states, not two: "system" is a real choice, distinct from having
 * picked light or dark. Only light and dark write `data-theme` onto the
 * document; under "system" the attribute is removed so the CSS
 * `prefers-color-scheme` block takes over. That keeps one source of truth —
 * the OS — rather than snapshotting it into storage where it would go stale
 * the moment the user changes their system setting.
 *
 * All three are written to storage, including "system". The product default is
 * dark, and the pre-paint script distinguishes "chose to follow the OS" from
 * "has never chosen" by whether anything is stored at all.
 *
 * The chosen theme is read from the document element through
 * `useSyncExternalStore` rather than held in `useState`. The document is the
 * real owner: the pre-paint script has already stamped `data-theme` before
 * React runs, so a `useState` initialiser would return "system" on the server
 * and "light"/"dark" on the client, and hydration would leave `aria-pressed`
 * permanently disagreeing with what is on screen. The server snapshot is what
 * lets React reconcile the two cleanly.
 */

export type { Theme };

interface ThemeContextValue {
  /** What the user chose, including "system". */
  theme: Theme;
  /** What is actually being displayed right now. */
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function readTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

/** The server cannot know the choice; "system" is the neutral default. */
function serverTheme(): Theme {
  return "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
  const prefersDark = usePrefersDark();

  // Derived, never stored — mirroring the media query into state would mean
  // writing to state from an effect on every OS theme change.
  const resolved: "light" | "dark" =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;

    // Colours cross-fade only during a deliberate switch. A permanent global
    // transition would make every hover feel sluggish.
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 220);

    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);

    try {
      // "system" is stored rather than cleared. The pre-paint script reads an
      // empty slot as "never chosen" and stamps the product default, which is
      // dark — so clearing the key would silently convert a deliberate
      // "follow my OS" into "dark" on the next visit.
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). The theme
      // still applies for this session; it simply will not be remembered.
    }

    listeners.forEach((listener) => listener());
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
