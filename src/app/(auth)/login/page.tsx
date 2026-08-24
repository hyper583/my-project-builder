import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import { LoginForm } from "@/components/auth/auth-forms";
import { isGoogleAuthConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const justReset = params.reset === "1";

  /*
   * Failures that happen at Google's redirect back, not on this form.
   *
   * `unable_to_link_account` is the one that will actually be seen. Better Auth
   * refuses to attach a social login to an existing password account unless
   * that account's email is verified, which is what stops someone registering
   * another person's address and then inheriting their Google sign-in. The
   * message has to say what to do about it, because "unable_to_link_account"
   * on an unstyled page tells a student nothing.
   */
  const OAUTH_ERRORS: Record<string, string> = {
    unable_to_link_account:
      "There is already an account with this email address and a password. " +
      "Sign in with that password once and confirm your email, and Google will " +
      "work from then on.",
    email_not_verified:
      "Google has not confirmed that email address, so it cannot be used to sign in.",
    account_already_linked_to_different_user:
      "That Google account is already connected to a different account here.",
    email_does_not_match: "That Google account uses a different email address.",
    email_not_found: "Google did not share an email address, so an account cannot be made.",
  };
  const oauthError =
    typeof params.error === "string"
      ? (OAUTH_ERRORS[params.error] ??
        "Google sign-in did not complete. Please try again, or use your password.")
      : null;

  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 leading-relaxed text-muted-foreground">
        Welcome back. Pick up where you left off.
      </p>

      {/* Confirms the reset landed. Without it the redirect from choosing a
          new password looks indistinguishable from being signed out. */}
      {justReset ? (
        <p
          role="status"
          className="mt-5 flex items-start gap-2.5 rounded-md border border-success/35 bg-success-subtle p-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Your password has been changed. Sign in with your new one.
        </p>
      ) : null}

      <div className="mt-7">
        <LoginForm googleEnabled={isGoogleAuthConfigured} initialError={oauthError} />
      </div>
    </>
  );
}
