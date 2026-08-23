"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useDismissable } from "@/lib/use-dismissable";
import { cn } from "@/lib/utils";

/**
 * A bottom sheet, for touch.
 *
 * On a phone the workspace's side panels have nowhere to go: shown inline they
 * crush the document to nothing, and shown as full-screen takeovers they lose
 * the context the panel exists to comment on. A sheet keeps the document
 * visible above it, which is the whole reason to reach for one.
 *
 * Mount it only while it is open — `{open ? <Sheet … /> : null}` — rather than
 * passing an `open` prop. Presence is the state, so each opening starts clean
 * and the entrance animation runs every time.
 *
 * Rendered through a portal so it escapes the workspace's `overflow-hidden`
 * panes, and capped at 85vh so the document behind is never fully covered.
 */
export function Sheet({
  onClose,
  title,
  children,
  className,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDismissable(onClose, panel);

  // A sheet only ever opens in response to a user action, so by the time this
  // renders there is always a document. No mounted flag, and no extra frame.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="fade-in absolute inset-0 cursor-default bg-black/55"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "sheet-up absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col",
          "rounded-t-xl border-t border-border bg-surface elevated-4 outline-none",
          className,
        )}
        // Home-indicator clearance. Without it the last row of a scrolling
        // sheet sits under the system gesture bar and cannot be tapped.
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="relative flex shrink-0 items-center gap-3 border-b border-border px-4 pt-4 pb-3">
          {/* The grab affordance. Decorative — the sheet is not draggable, and
              an affordance that suggests otherwise is a control that lies. */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-2 mx-auto h-1 w-9 rounded-full bg-border-strong"
          />
          <h2 className="flex-1 text-sm font-semibold tracking-[-0.01em]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="focus-glow flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
