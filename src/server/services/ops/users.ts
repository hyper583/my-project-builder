import { entitlementsFor, type PlanTier } from "@/config/plans";
import { prisma } from "@/server/db";

/**
 * The people using the product, for administration.
 *
 * Metadata only. Names, plans, counts and dates — never the content of anyone's
 * project, and never anything resembling a credential. Reading a student's
 * actual work is a separate, audited action that belongs to the Projects slice;
 * nothing here should make it look casual.
 */

/** Usage is reported over the same rolling window the plan limits use. */
const WINDOW_DAYS = 30;

export interface AdminUserRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: "STUDENT" | "ADMIN";
  readonly planTier: PlanTier;
  readonly planLabel: string;
  readonly suspendedAt: Date | null;
  readonly createdAt: Date;
  readonly projects: number;
  readonly generations: number;
  readonly generationLimit: number;
  readonly edits: number;
  readonly editLimit: number;
  /** True when this account is the only thing standing between you and lockout. */
  readonly lastActiveAdmin: boolean;
}

export async function listUsers(search: string, limit = 100): Promise<AdminUserRow[]> {
  const term = search.trim();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000);

  const [users, activeAdmins] = await Promise.all([
    prisma.user.findMany({
      where: term
        ? {
            OR: [
              { email: { contains: term, mode: "insensitive" } },
              { name: { contains: term, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        planTier: true,
        suspendedAt: true,
        createdAt: true,
        _count: { select: { projects: { where: { deletedAt: null } } } },
      },
    }),
    prisma.user.count({ where: { role: "ADMIN", suspendedAt: null } }),
  ]);

  if (users.length === 0) return [];

  // One grouped query rather than a count per user, so the list does not get
  // slower in proportion to how many people are on it.
  const usage = await prisma.usageRecord.groupBy({
    by: ["userId", "kind"],
    where: { userId: { in: users.map((u) => u.id) }, createdAt: { gte: since } },
    _count: { _all: true },
  });

  const counted = new Map<string, { generations: number; edits: number }>();
  for (const row of usage) {
    const entry = counted.get(row.userId) ?? { generations: 0, edits: 0 };
    if (row.kind === "AI_GENERATION") entry.generations = row._count._all;
    if (row.kind === "AI_EDIT") entry.edits = row._count._all;
    counted.set(row.userId, entry);
  }

  return users.map((user) => {
    const plan = entitlementsFor(user.planTier);
    const used = counted.get(user.id) ?? { generations: 0, edits: 0 };

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      planTier: user.planTier,
      planLabel: plan.label,
      suspendedAt: user.suspendedAt,
      createdAt: user.createdAt,
      projects: user._count.projects,
      generations: used.generations,
      generationLimit: plan.maxGenerationsPerMonth,
      edits: used.edits,
      editLimit: plan.maxEditsPerMonth,
      // Surfaced so the UI can explain why an action is unavailable, rather
      // than presenting a control that fails when pressed.
      lastActiveAdmin: user.role === "ADMIN" && !user.suspendedAt && activeAdmins <= 1,
    };
  });
}
