"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscriptions to browser state that React must stay in step with.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the browser is
 * the owner of this state, so mirroring it into React state means writing to
 * state during an effect, which cascades an extra render on every change and
 * is what the react-hooks purity rules flag. The server snapshot is what makes
 * these safe to read during server rendering.
 */

/** Tracks the OS colour-scheme preference, live. */
export function usePrefersDark(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    // The server cannot know the preference; light is the documented default.
    () => false,
  );
}

/**
 * Tracks a media query, live.
 *
 * For deciding what to *mount*, not what to show — CSS already handles showing
 * and hiding, and does it without JavaScript. This exists for the workspace,
 * where the assistant appears in a column on a wide screen and in a bottom
 * sheet on a narrow one: rendering it in both places would give it two
 * independent conversation states that silently diverge.
 *
 * The server snapshot is `true`. The server cannot measure a viewport, and a
 * writing workspace is used on a wide screen more often than not; on a narrow
 * one the correction happens against markup that CSS was hiding anyway, so
 * nothing visibly moves either way.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

/* A single notifier for every persisted flag — writes are rare, and one
 * shared channel keeps tabs of the same document consistent. */
const flagListeners = new Set<() => void>();

function subscribeToFlags(onChange: () => void) {
  flagListeners.add(onChange);
  return () => {
    flagListeners.delete(onChange);
  };
}

/** A boolean preference stored in localStorage, readable during render. */
export function usePersistedFlag(
  key: string,
  fallback: boolean,
): [boolean, (next: boolean) => void] {
  const getSnapshot = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : raw === "1";
    } catch {
      // Storage blocked — fall back rather than throwing during render.
      return fallback;
    }
  }, [key, fallback]);

  const value = useSyncExternalStore(subscribeToFlags, getSnapshot, () => fallback);

  const setValue = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // The preference simply is not remembered.
      }
      flagListeners.forEach((listener) => listener());
    },
    [key],
  );

  return [value, setValue];
}
