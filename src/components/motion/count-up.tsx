"use client";

import { useCallback, useRef, useState } from "react";

import { observeReveal, prefersReducedMotion } from "@/lib/reveal-on-scroll";

/**
 * Counts a statistic up to its value when it scrolls into view.
 *
 * The number is rendered at its true value on the server and only animates
 * once the client takes over, so the figure is correct in the HTML, correct
 * with JavaScript disabled, and correct to a screen reader — the motion is
 * decoration layered on top of a value that was already right.
 *
 * Driven by requestAnimationFrame rather than a CSS transition because the
 * thing being interpolated is text content, which CSS cannot animate.
 *
 * Shares the scroll scheduler with `Reveal`, so a figure jumped past still
 * lands on its true value instead of sitting at zero — a wrong number is far
 * worse than a missing animation.
 */
export function CountUp({ value, durationMs = 650 }: { value: number; durationMs?: number }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) {
        cleanup.current?.();
        cleanup.current = null;
        return;
      }
      if (started.current || value <= 0) return;
      if (prefersReducedMotion()) return;

      started.current = true;

      cleanup.current = observeReveal(node, () => {
        // Reset in the same beat the animation begins. Zeroing earlier would
        // show the server-rendered figure, blank it, and count it back up —
        // a visible flicker on anything already above the fold.
        setShown(0);
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          // Ease-out: fast to begin, settling gently on the true figure.
          const eased = 1 - Math.pow(1 - progress, 3);
          setShown(Math.round(value * eased));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    [value, durationMs],
  );

  // The accessible value never counts: assistive technology is told the real
  // figure once, not every intermediate frame.
  return (
    <span ref={ref}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
