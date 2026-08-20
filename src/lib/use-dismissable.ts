"use client";

import { useEffect, useRef } from "react";

/** Elements that can hold focus, in document order. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Modal surface behaviour: Escape closes, Tab cycles inside, focus is restored
 * on close, and the page behind stops scrolling.
 *
 * Shared by the command palette and the mobile sheets so the two cannot drift
 * apart — a dialog that traps focus and one that does not are the same
 * component to a mouse user and completely different ones to everybody else.
 *
 * There is no `open` argument. Callers mount the dialog only while it is open,
 * so being mounted *is* being open; a component that renders `null` while
 * closed keeps its state between openings, which is how a palette ends up
 * reopening onto last time's search text.
 *
 * Focus restoration reads the active element at mount rather than being told
 * what to return to. The caller usually does not know: the palette can be
 * opened by a keyboard shortcut from anywhere on the page.
 */
export function useDismissable(onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  // Held in a ref so a re-render while open cannot lose the return target.
  const restoreTo = useRef<HTMLElement | null>(null);

  // The callback is read through a ref so the subscription below does not tear
  // down and rebuild whenever a caller passes an inline arrow function.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;

    const container = ref.current;
    // Move focus in, so the first Tab lands inside rather than in the page
    // behind. An explicitly autofocused child wins if the caller marked one.
    const preferred = container?.querySelector<HTMLElement>("[data-autofocus]");
    (preferred ?? container?.querySelector<HTMLElement>(FOCUSABLE) ?? container)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
        return;
      }

      if (event.key !== "Tab" || !container) return;

      const targets = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (targets.length === 0) return;

      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;

      // Wrap at both ends. Without this, Tab walks out of the dialog and into
      // the browser chrome, and the user cannot get back without a mouse.
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      // Guard the restore: the trigger may have unmounted while we were open.
      if (restoreTo.current?.isConnected) restoreTo.current.focus();
    };
  }, [ref]);
}
