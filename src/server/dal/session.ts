import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppError } from "@/server/errors";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import type { PlanTier } from "@/config/plans";

export interface CurrentUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: "STUDENT" | "ADMIN";
  readonly planTier: PlanTier;
}

/**
 * Reads the session. Memoised per render pass with React `cache` so a page that
 * checks authorisation in several places still performs one lookup.
 *
 * Returns null when unauthenticated — callers that require a user should use
 * `requireSession` or `requireUser` instead.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  // Re-read role, plan and suspension from the database rather than trusting
  // the session payload, so a suspension or demotion takes effect immediately
  // instead of at the next session refresh.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, planTier: true, suspendedAt: true },
  });

  if (!user || user.suspendedAt) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    planTier: user.planTier,
  };
});

/** Throws when unauthenticated. Use inside server actions and route handlers. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED");
  return user;
}

/** Redirects to login when unauthenticated. Use inside Server Components. */
export async function requireSession(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Admin guard. Enforced server-side — never by hiding a nav link. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AppError("NOT_FOUND");
  return user;
}
