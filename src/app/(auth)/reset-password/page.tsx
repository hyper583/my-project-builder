import { Suspense } from "react";
import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/password-reset-forms";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * The form reads the token from the query string with `useSearchParams`, which
 * Next requires to sit inside a Suspense boundary — without one the whole
 * route is forced out of static rendering and the build warns.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<p className="leading-relaxed text-muted-foreground">Checking your link…</p>}
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
