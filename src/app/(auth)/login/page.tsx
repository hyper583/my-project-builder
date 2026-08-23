import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import { LoginForm } from "@/components/auth/auth-forms";
import { isGoogleAuthConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const justReset = params.reset === "1";

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
        <LoginForm googleEnabled={isGoogleAuthConfigured} />
      </div>
    </>
  );
}
