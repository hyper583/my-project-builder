"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH, signIn, signUp } from "@/lib/auth-client";

/**
 * Google's own mark, inline.
 *
 * Not a lucide icon — lucide carries no brand marks, and Google's sign-in
 * branding requires their four-colour G rather than a generic glyph. The
 * colours are literals on purpose: they are Google's, not this product's, so
 * they must not follow the theme tokens or shift in dark mode.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  required = true,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
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
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={"h-11 w-full field px-3 text-base"}
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

/**
 * "Continue with Google", for both forms.
 *
 * One component rather than two copies: Google is the same act whether the
 * account exists or not — the provider creates it if it does not — so a "sign
 * up with Google" that behaved differently from "sign in with Google" would be
 * two names for one flow, and one of them would eventually drift.
 *
 * It was on the sign-in form only, which meant a student who wanted to start
 * with Google had to first guess that the sign-in page would take them.
 */
function GoogleButton({
  pending,
  onStart,
  onFailure,
}: {
  pending: boolean;
  onStart: () => void;
  onFailure: (message: string) => void;
}) {
  async function go() {
    onStart();
    const { error } = await signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
      // Where Google sends them back to when the link is refused. Without it
      // they land on Better Auth's own unstyled error page, which says
      // "unable_to_link_account" and offers no way forward.
      errorCallbackURL: "/login",
    });
    // On success the browser is redirected to Google, so reaching this line
    // with no error means the redirect is in flight — leave the button busy.
    if (error) {
      onFailure("Google sign-in could not be started. Please try again, or use your password.");
    }
  }

  return (
    <>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-subtle-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={go} disabled={pending}>
        <GoogleMark />
        Continue with Google
      </Button>
    </>
  );
}

export function RegisterForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setPending(true);
    const { error: authError } = await signUp.email({ name, email, password });
    setPending(false);

    if (authError) {
      setError(authError.message ?? "We couldn't create your account. Please try again.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? <ErrorBanner message={error} /> : null}
      <Field id="name" label="Your name" autoComplete="name" />
      <Field id="email" label="Email address" type="email" autoComplete="email" />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Creating your account…" : "Create account"}
      </Button>

      {googleEnabled ? (
        <GoogleButton
          pending={pending}
          onStart={() => {
            setError(null);
            setPending(true);
          }}
          onFailure={(message) => {
            setPending(false);
            setError(message);
          }}
        />
      ) : null}

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({
  googleEnabled = false,
  initialError = null,
}: {
  googleEnabled?: boolean;
  /** A failure that happened before this page loaded, e.g. an OAuth callback. */
  initialError?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);
  // Checked by default. Signing in on your own laptop and being asked again
  // tomorrow is the annoyance; the box exists so someone on a shared or
  // library machine can opt out of it.
  const [remember, setRemember] = useState(true);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);

    setPending(true);
    const { error: authError } = await signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      // Better Auth defaults this to true. Passing it explicitly is what makes
      // the checkbox mean something: unchecked issues a session cookie that
      // ends when the browser closes, rather than the 30-day one.
      rememberMe: remember,
    });
    setPending(false);

    if (authError) {
      // Deliberately generic: never reveal whether the email exists.
      setError("That email and password combination didn't work. Please try again.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? <ErrorBanner message={error} /> : null}
      <Field id="email" label="Email address" type="email" autoComplete="email" />
      <Field id="password" label="Password" type="password" autoComplete="current-password" />

      {/* Explicit id and htmlFor, matching `Field` above. A wrapping label is
          valid, but the accessibility tree reported this control as "on" — the
          value rather than the name — and an unnamed control is the defect
          this codebase has already had to fix once. */}
      <div className="flex items-center gap-2.5">
        <input
          id="remember-me"
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="focus-glow size-4 cursor-pointer rounded border-border accent-primary"
        />
        <label htmlFor="remember-me" className="w-fit cursor-pointer text-sm">
          Keep me signed in
        </label>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      {googleEnabled ? (
        <GoogleButton
          pending={pending}
          onStart={() => {
            setError(null);
            setPending(true);
          }}
          onFailure={(message) => {
            setPending(false);
            setError(message);
          }}
        />
      ) : null}

      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgot your password?
        </Link>
        <span>
          New here?{" "}
          <Link href="/register" className="font-medium text-primary underline underline-offset-4">
            Create an account
          </Link>
        </span>
      </div>
    </form>
  );
}
