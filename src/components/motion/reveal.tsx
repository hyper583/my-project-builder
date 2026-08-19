"use client";

import { useCallback, useRef } from "react";

import { observeReveal } from "@/lib/reveal-on-scroll";

/**
 * Reveals its children when they reach the fold.
 *
 * Hiding content until script releases it is a risk, so the failure modes are
 * handled explicitly rather than hoped away:
 *
 * - elements jumped straight past (anchor link, End key, flick scroll) are
 *   still revealed — see `reveal-on-scroll` for why an IntersectionObserver
 *   cannot do this;
 * - `prefers-reduced-motion` is handled in CSS, so the final state is painted
 *   even if this component never mounts at all;
 * - once revealed, an element is unregistered and never hidden again.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  /** Stagger, in milliseconds. Sequenced entrances read as deliberate. */
  delay?: number;
  as?: "div" | "section" | "li" | "article";
  className?: string;
}) {
  const cleanup = useRef<(() => void) | null>(null);

  // A callback ref rather than an effect: it runs the moment the node exists,
  // and React hands back `null` on unmount so the registration can be undone.
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) {
      cleanup.current?.();
      cleanup.current = null;
      return;
    }
    cleanup.current = observeReveal(node, (element) => {
      element.classList.add("is-visible");
    });
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${className}`}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
