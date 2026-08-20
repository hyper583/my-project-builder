"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH, requestPasswordReset, resetPassword } from "@/lib/auth-client";

/**
 * Password reset.
 *
 * The server side was already wired — `sendResetPassword` in the auth config
 * hands the link to the email driver — but these two screens were never built,
 * which left "Forgot your password?" on the sign-in form pointing at a 404.
 */

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      {/* Visible label — never a placeholder standing in for one. */}
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={[
          "h-11 w-full rounded-md border border-input bg-card px-3 text-base",
          "transition-[border-color] duration-150",
          "placeholder:text-subtle-foreground",
          "hover:border-border-strong",
          "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        ].join(" ")}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    const result = await requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);

    // Only a transport failure is reported. Whether the address matched an
    // account is never revealed — see the confirmation copy below.
    if (result.error) {
      setError("We couldn't send the email just now. Please try again in a moment.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div>
        <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold">Check your email</h1>
        {/*
          Deliberately the same message whether or not the address has an
          account. Saying "no account with that email" would turn this form
          into an account-enumeration oracle, which is why the server returns
          an identical response either way.
        */}
        <p className="mt-2 leading-relaxed text-muted-foreground">
          If that address has an account, a link to choose a new password is on its way. The
          link expires in an hour.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Forgot your password?</h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Enter the email you signed up with and we will send you a link to choose a new one.
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <Field id="email" label="Email address" type="email" autoComplete="email" />

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="text-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirm") ?? "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("Those two passwords do not match.");
      return;
    }
    if (!token) return;

    setPending(true);
    const result = await resetPassword({ newPassword: password, token });
    setPending(false);

    if (result.error) {
      setError(
        result.error.message ??
          "We couldn't reset your password. The link may have expired — request a new one.",
      );
      return;
    }

    router.push("/login?reset=1");
    router.refresh();
  }

  // Better Auth redirects here with `?error=INVALID_TOKEN` when the link has
  // expired or already been used, so a dead link is explained on arrival
  // rather than after the student has typed a new password twice.
  if (!token || linkError) {
    return (
      <div>
        <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold">This link has expired</h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Reset links last an hour and can only be used once. Request a new one and it will
          arrive in a moment.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Pick something you have not used elsewhere.
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <Field
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <Field
        id="confirm"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
      />

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
