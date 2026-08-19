import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 mb-7 leading-relaxed text-muted-foreground">
        Welcome back. Pick up where you left off.
      </p>
      <LoginForm />
    </>
  );
}
