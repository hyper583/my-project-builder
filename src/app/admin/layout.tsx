import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/server/dal/session";

export const metadata: Metadata = { title: "Operations" };

/**
 * The admin console.
 *
 * Deliberately unlinked from the student interface. Admins reach it by typing
 * the URL; nothing anywhere hints it exists, and `requireAdmin()` throws
 * NOT_FOUND rather than a forbidden error, so probing the route tells an
 * attacker nothing about whether it is there.
 *
 * It has its own chrome rather than the student shell, because the two are
 * different products for different audiences, and sharing a sidebar would make
 * the navigation depend on role — one more branch to get wrong, where a
 * rendering bug becomes an information leak rather than a cosmetic one.
 *
 * The navigation itself lives in `AdminShell`, which is a client component
 * because marking the current section needs the pathname.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Enforced here AND in every action. A layout guard protects the pages but
  // not the server actions those pages can reach.
  const admin = await requireAdmin();

  return <AdminShell email={admin.email}>{children}</AdminShell>;
}
