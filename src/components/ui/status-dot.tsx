import { cn } from "@/lib/utils";

/**
 * A state indicator.
 *
 * The pulse is the point, and it is why this is a component rather than a
 * class: it animates for exactly two states — a generation job that is
 * RUNNING, and a document extraction that is PROCESSING — and is still for
 * everything else. An indicator that always pulses is decoration wearing the
 * costume of information, and once a user notices that, every other indicator
 * in the product loses its credibility too.
 *
 * The tone table is exhaustive over the two enums it serves
 * (`ProjectStatus` and `ExtractionStatus`) plus `JobStatus`, so a status that
 * reaches here unrecognised falls to neutral rather than silently borrowing
 * the colour of whichever branch happened to be last.
 */

type Tone = "live" | "success" | "warning" | "destructive" | "neutral";

const TONES: Record<string, Tone> = {
  // ProjectStatus
  DRAFT: "neutral",
  GENERATING: "live",
  READY: "success",
  ARCHIVED: "neutral",
  // ExtractionStatus
  PENDING: "neutral",
  PROCESSING: "live",
  COMPLETE: "success",
  UNSUPPORTED: "warning",
  // JobStatus (FAILED is shared with ExtractionStatus)
  QUEUED: "neutral",
  RUNNING: "live",
  SUCCEEDED: "success",
  FAILED: "destructive",
  CANCELLED: "neutral",
};

const DOT: Record<Tone, string> = {
  live: "bg-live",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  neutral: "bg-subtle-foreground",
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const tone = TONES[status] ?? "neutral";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        DOT[tone],
        tone === "live" && "pulse-live",
        className,
      )}
    />
  );
}

/** Whether a status means work is actively running. */
export function isLive(status: string): boolean {
  return TONES[status] === "live";
}
