"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;

/** Minimum password length. Mirrors `minPasswordLength` in the auth config. */
export const MIN_PASSWORD_LENGTH = 10;
