"use client";

import { useState } from "react";
import { AlertCircle, Check, Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Confirming an email address after the fact.
 *
 * The verification email is sent at sign-up, which leaves every account
 * created before that existed — and anyone who lost the email — with no way to
 * ever become verified. That mattered the moment Google sign-in shipped:
 * linking a Google login to an existing password account requires the local
 * address to be verified, so the sign-in page tells people to go and confirm
 * theirs. Without this, that instruction named something the product did not
 * let them do, which is worse than a blunt refusal.
 *
 * Nothing here is gated on being verified. It unlocks Google as a second way
 * in; it is not a toll gate on the product.
 */
export function EmailConfirmation({
  email,
  verified,
}: {
  email: string;
  verified: boolean;
}) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (verified) {
    return (
      <p className="flex items-center gap-2.5 text-sm text-success">
        <Check className="size-4 shrink-0" aria-hidden="true" />
        Confirmed. You can sign in with Google as well as with your password.
      </p>
    );
  }

  async function send() {
    setPending(true);
    setError(null);
    const { error: sendError } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/settings",
    });
    setPending(false);

    if (sendError) {
      setError("That didn't send. Please try again in a moment.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Your email address is not confirmed yet. Confirming it lets you sign in with Google as
        well as with your password. Nothing else changes.
      </p>

      {sent ? (
        <p role="status" className="flex items-start gap-2.5 text-sm text-success">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Sent to {email}. Open the link in it to finish.
        </p>
      ) : (
        <Button onClick={send} disabled={pending} variant="outline">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? "Sending…" : "Send a confirmation email"}
        </Button>
      )}

      {error ? (
        <p role="alert" className="flex items-start gap-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
