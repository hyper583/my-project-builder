"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/lib/auth-client";

/**
 * Account menu.
 *
 * Hand-rolled rather than pulling in a menu library for one dropdown. The
 * behaviours that actually matter for keyboard and screen-reader users are
 * implemented explicitly: Escape closes and returns focus to the trigger,
 * a click outside closes, and focus moving out of the panel closes it.
 */
export function AccountMenu({
  email,
  name,
  role,
  planTier,
}: {
  email: string;
  name: string | null;
  role: string;
  planTier: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Returning focus to the trigger keeps keyboard users where they were.
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initials =
    (name ?? email)
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        // The visible name is hidden below `sm`, and the initials and chevron
        // are decorative — without this the button has no accessible name at
        // all on a phone. Including the name keeps the accessible name a
        // superset of the visible one (WCAG "Label in Name").
        aria-label={`Account menu — ${name ?? email}`}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-md pr-1.5 pl-1 transition-colors duration-150 hover:bg-muted"
      >
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-full bg-primary text-[0.7rem] font-semibold text-on-primary"
        >
          {initials}
        </span>
        <span className="hidden max-w-36 truncate text-sm text-muted-foreground sm:inline">
          {name ?? email}
        </span>
        <ChevronDown className="size-3.5 text-subtle-foreground" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-1.5 w-64 origin-top-right rounded-lg border border-border bg-card p-1 elevated-3"
        >
          <div className="border-b border-border px-3 pt-2 pb-3">
            <p className="truncate text-sm font-medium">{name ?? "Your account"}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
                {planTier === "PAID" ? "Paid" : "Free"}
              </span>
              {role === "ADMIN" ? (
                <span className="flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-[0.68rem] font-medium tracking-wide text-accent uppercase">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  Admin
                </span>
              ) : null}
            </div>
          </div>

          {/*
           * The way into the admin console.
           *
           * The badge above says an account is an admin; it is a label, not a
           * way to go anywhere. Without this link the console was reachable
           * only by typing `/admin` into the address bar, which is not a
           * feature — an admin who cannot find the console does not have one.
           */}
          {role === "ADMIN" ? (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted"
            >
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
              Admin console
            </Link>
          ) : null}

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${role === "ADMIN" ? "" : "mt-1 "}flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted`}
          >
            <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
            Settings
          </Link>

          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await signOut();
              router.push("/");
              router.refresh();
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-muted disabled:opacity-50"
          >
            <LogOut className="size-4 text-muted-foreground" aria-hidden="true" />
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
