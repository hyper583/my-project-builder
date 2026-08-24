import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GrantOutcome } from "@/server/services/payments/grant";

/**
 * What the student sees when Paystack sends them back.
 *
 * Four outcomes, and the one that earns this component its keep is `pending`.
 * Bank transfer is the method most Nigerian students will use and it can settle
 * a minute after the page loads — reporting that as a failure would tell
 * someone who has genuinely paid that their money went nowhere. It says the
 * bank is still confirming, and gives them a button to look again.
 *
 * `already` is a success, not a warning. It is what a refresh looks like, and
 * what the webhook winning the race looks like.
 */
export function PassReturn({
  outcome,
  continueHref,
  continueLabel,
  recheckHref,
}: {
  outcome: GrantOutcome | { status: "missing" };
  continueHref: string;
  continueLabel: string;
  /** This page, reference and all. Following it runs the check again. */
  recheckHref: string;
}) {
  if (outcome.status === "granted" || outcome.status === "already") {
    return (
      <Panel
        tone="success"
        icon={<Check className="size-5" aria-hidden="true" />}
        title="Payment received"
        body={
          outcome.projectId
            ? "Your pass has been applied to this project. Every chapter is unlocked — " +
              "press Generate to write the ones that are still empty."
            : "Your pass is ready. Open the project you want it spent on and unlock it there."
        }
      >
        <Button asChild className="mt-5">
          <Link href={continueHref}>
            {continueLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </Panel>
    );
  }

  /*
   * `abandoned` is shown as waiting rather than as a failure.
   *
   * Paystack marks a transaction abandoned as soon as the checkout page is
   * closed, which is exactly what a student does after starting a bank
   * transfer in their banking app. Telling them the payment failed at that
   * moment is both wrong and the most expensive thing this page could say —
   * they would either give up or pay a second time.
   */
  if (outcome.status === "pending" || outcome.status === "abandoned") {
    return (
      <Panel
        tone="warning"
        icon={<Clock className="size-5" aria-hidden="true" />}
        title="Waiting for your payment"
        body={
          "We have not seen your payment yet. Bank transfers usually clear within a " +
          "minute or two. Nothing has been lost and you have not been charged twice — " +
          "check again shortly, and your pass will be applied as soon as it lands."
        }
      >
        {/*
          A plain link back to this same URL, not a scripted poll. Following it
          re-runs the check on the server, it works with the page's JavaScript
          broken, and it leaves the student in control of when to ask again.

          `prefetch={false}` because prefetching this would verify the
          transaction on hover — a real API call, made without being asked.
        */}
        <Button asChild variant="outline" className="mt-5">
          <Link href={recheckHref} prefetch={false}>
            Check again
          </Link>
        </Button>
      </Panel>
    );
  }

  return (
    <Panel
      tone="destructive"
      icon={<AlertCircle className="size-5" aria-hidden="true" />}
      title={outcome.status === "missing" ? "No payment to check" : "Payment did not complete"}
      body={
        outcome.status === "missing"
          ? "This page confirms a payment, and it was opened without one. If you have just " +
            "paid, use the link in your email receipt."
          : "The payment was not completed, so nothing has been charged and no pass has been " +
            "created. You can try again whenever you are ready."
      }
    >
      <Button asChild variant="outline" className="mt-5">
        <Link href={continueHref}>{continueLabel}</Link>
      </Button>
    </Panel>
  );
}

const TONES = {
  success: "border-success/35 bg-success-subtle text-success",
  warning: "border-warning/35 bg-warning-subtle text-warning",
  destructive: "border-destructive/35 bg-destructive-subtle text-destructive",
} as const;

function Panel({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 elevated-1 sm:p-8">
      <div
        className={`flex size-11 items-center justify-center rounded-full border ${TONES[tone]}`}
      >
        {icon}
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.018em]">{title}</h1>
      <p className="mt-2.5 leading-relaxed text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
