import type { Metadata } from "next";

import { RegisterForm } from "@/components/auth/auth-forms";
import { isGoogleAuthConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create your account" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-2 mb-7 leading-relaxed text-muted-foreground">
        Your projects are private to you and saved as you work.
      </p>
      <RegisterForm googleEnabled={isGoogleAuthConfigured} />
    </>
  );
}
