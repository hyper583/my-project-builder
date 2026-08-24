"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { formatPassPrice } from "@/config/plans";
import { startPassCheckout } from "@/server/actions/passes";

/**
 * The button that takes money.
 *
 * Every paywall in the product routes through this one component, so there is
 * a single place where the price is read, a single place the checkout is
 * opened, and no chance of one paywall quoting a figure the server will not
 * charge. Until this existed the paywalls were decorative: `startPassCheckout`
 * was correct and complete, and nothing in the interface called it.
 *
 * `pending` is never cleared on success. The next thing that happens is a
 * full-page navigation to Paystack, and a button that springs back to "Buy a
 * project pass" during that gap invites a second press — which opens a second
 * transaction against the same project.
 */
export function BuyPassButton({
  projectId,
  label,
  variant = "primary",
  size = "md",
  className,
}: {
  /** Buys for this project, so the pass is spent on it automatically. Omit to buy a spare. */
  projectId?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);

    const response = await startPassCheckout(projectId ? { projectId } : {});

    if (!response.ok) {
      setError(response.message);
      setPending(false);
      return;
    }

    // Leaving the application. Deliberately a full navigation rather than a new
    // tab: a popup blocker eats the tab and the student sees nothing happen.
    window.location.assign(response.data.url);
  }

  return (
    <div className={className}>
      <Button onClick={go} disabled={pending} variant={variant} size={size}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Opening checkout…" : (label ?? `Unlock for ${formatPassPrice()}`)}
      </Button>

      {error ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
