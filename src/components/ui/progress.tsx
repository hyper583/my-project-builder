import { cn } from "@/lib/utils";

/**
 * A determinate progress bar.
 *
 * Extracted from the dashboard card so the wizard rail, the project cards and
 * the health panel all report progress the same way. It is deliberately
 * determinate-only: an indeterminate bar is a claim that something is
 * happening, and everything in this product that shows progress knows its own
 * number.
 *
 * `value` is clamped rather than trusted. A percentage arriving above 100 from
 * a rounding error should saturate the bar, not overflow its track.
 */
export function Progress({
  value,
  label,
  tone = "primary",
  className,
}: {
  value: number;
  /** Announced to screen readers; the visible caption lives with the caller. */
  label: string;
  tone?: "primary" | "live" | "success";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  const fill =
    tone === "live" ? "bg-live" : tone === "success" ? "bg-success" : "bg-primary";

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted",
        // A hairline inside the track gives the fill an edge to sit against,
        // which is what stops a 4% bar from looking like a rendering artefact.
        "inset-ring inset-ring-border/60",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
