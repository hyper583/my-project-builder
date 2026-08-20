import { cn } from "@/lib/utils";

/**
 * A loading placeholder.
 *
 * Shaped like the content it stands in for, so the layout does not jump when
 * the real thing arrives — a skeleton that is the wrong size is worse than no
 * skeleton, because it converts a wait into a visible reflow.
 *
 * `aria-hidden` throughout: the container announces the wait once via a live
 * region, rather than every bar announcing itself.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("shimmer rounded-md", className)} />;
}

/** A block of text lines, the last one short, the way a paragraph ends. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3", index === lines - 1 ? "w-2/5" : "w-full")}
        />
      ))}
    </div>
  );
}
