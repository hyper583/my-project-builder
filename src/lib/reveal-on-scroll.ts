"use client";

/**
 * Shared scroll-reveal scheduler.
 *
 * One listener for the whole page rather than an observer per element, and
 * deliberately NOT `IntersectionObserver`.
 *
 * The observer looks like the right tool and fails on the case that matters:
 * it reports threshold *crossings*, so an element that goes from below the
 * viewport to above it — an anchor jump, the End key, a flick scroll — holds
 * an intersection ratio of zero throughout and never produces a callback at
 * all. Anything waiting on it stays invisible permanently. This page has
 * in-page anchors, so that is a normal interaction, not an edge case.
 *
 * A position check answers the only question being asked — "has this reached
 * the fold yet?" — for every element, however the viewport got there. It is
 * coalesced into one `requestAnimationFrame` per frame, elements are dropped
 * from the set the moment they are revealed, and the listeners are removed
 * once nothing is left pending, so a settled page costs nothing.
 */

type Revealer = (element: HTMLElement) => void;

const pending = new Map<HTMLElement, Revealer>();
let scheduled = false;
let listening = false;

/** Reveal slightly before the fold, so motion finishes as it comes into view. */
const TRIGGER_FRACTION = 0.92;

function flush() {
  scheduled = false;
  const limit = window.innerHeight * TRIGGER_FRACTION;

  for (const [element, reveal] of pending) {
    // `top < limit` covers both directions: an element approaching the fold,
    // and one already scrolled past (a negative top is still less than limit).
    if (element.getBoundingClientRect().top < limit) {
      reveal(element);
      pending.delete(element);
    }
  }

  if (pending.size === 0) stopListening();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(flush);
}

function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
}

/**
 * Registers an element to be revealed once it reaches the fold.
 * Returns an unregister function for unmount.
 */
export function observeReveal(element: HTMLElement, reveal: Revealer): () => void {
  pending.set(element, reveal);
  startListening();
  // Check immediately: the element may already be in view on first paint.
  schedule();

  return () => {
    pending.delete(element);
    if (pending.size === 0) stopListening();
  };
}

/** True when the user has asked for less motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
