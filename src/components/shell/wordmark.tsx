import { cn } from "@/lib/utils";

/**
 * The product mark.
 *
 * A drawn corner and a rule — a sheet being set out on a drafting table, which
 * is what the product does before it writes anything. Deliberately not a
 * letterform in a rounded square: an "M" in a blue tile is the most generic
 * mark a software product can have, and it was in three files here saying
 * nothing.
 *
 * `currentColor` throughout so it inherits whatever it is placed on — the blue
 * tile in the sidebar, the ink panel on the auth page — without a second
 * variant existing to fall out of step.
 */
export function MarkGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-4", className)}
      fill="none"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {/* The rule: the top edge of the sheet. */}
      <path d="M3 3h10" stroke="currentColor" strokeOpacity="0.55" strokeLinecap="square" />
      {/* The fold: structure being drawn out of it. */}
      <path d="M3 13V5.5L8 9l5-3.5V13" stroke="currentColor" strokeLinecap="square" />
    </svg>
  );
}

/** The mark on its tile, at the size the chrome uses it. */
export function MarkTile({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary",
        className,
      )}
    >
      <MarkGlyph />
    </span>
  );
}

/** Mark plus name, as it appears in a header. */
export function Wordmark({
  className,
  nameClassName,
}: {
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <MarkTile />
      <span
        className={cn(
          "truncate text-[0.9375rem] font-semibold tracking-[-0.02em]",
          nameClassName,
        )}
      >
        My Project Builder
      </span>
    </span>
  );
}
