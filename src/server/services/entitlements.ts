import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { FREE_PROJECT_ALLOWANCE, PASS_ALLOWANCE } from "@/config/plans";

/**
 * What a given user may do with a given project.
 *
 * The unit that matters is the PROJECT, not the account and not the month.
 * Entitlements used to be read from `User.planTier`, which had no end: one
 * payment granted a monthly-renewing allowance forever, so a ₦25,000 pass
 * turned loss-making inside four months and stayed that way.
 *
 * An expiry date would have been the obvious fix and the wrong one. The
 * product is priced per project and students take months over a final-year
 * project, so a clock punishes exactly the people who are working. A pass is
 * spent instead — consumed by one project, with a quota that does not renew.
 *
 * The two bases count differently, and deliberately:
 *
 *   free — a rate limit on a PERSON, over a rolling 30 days. It is acquisition
 *          spend, so it has to be bounded per human. Counting it per project
 *          would let someone delete and recreate their way to unlimited runs.
 *
 *   pass — a quota on a PROJECT, for as long as that project exists. No window,
 *          because the student already paid for this project specifically.
 */

export type EntitlementBasis = "admin" | "pass" | "free";

export interface ProjectEntitlements {
  readonly basis: EntitlementBasis;
  /** May the finished document be downloaded? */
  readonly canExport: boolean;
  readonly maxGenerations: number;
  readonly maxEdits: number;
}

export interface EntitlementActor {
  readonly id: string;
  readonly role: string;
}

const UNRESTRICTED: ProjectEntitlements = {
  basis: "admin",
  canExport: true,
  maxGenerations: Number.POSITIVE_INFINITY,
  maxEdits: Number.POSITIVE_INFINITY,
};

/**
 * Resolves what applies to one project.
 *
 * `claimedAt` is the test, not `projectId`. A hard-deleted project releases the
 * foreign key, and a released pass must not become spendable again — otherwise
 * generate, export, delete is an unlimited-use loop.
 */
export async function projectEntitlements(
  actor: EntitlementActor,
  projectId: string,
): Promise<ProjectEntitlements> {
  if (actor.role === "ADMIN") return UNRESTRICTED;

  const pass = await prisma.projectPass.findUnique({
    where: { projectId },
    select: { claimedAt: true, userId: true },
  });

  // Someone else's pass on a project they own is not this actor's to spend;
  // ownership is enforced before this is ever reached, and this is the belt.
  if (pass?.claimedAt && pass.userId === actor.id) {
    return { basis: "pass", canExport: true, ...PASS_ALLOWANCE };
  }

  return { basis: "free", canExport: false, ...FREE_PROJECT_ALLOWANCE };
}

/** Generation runs already spent, counted the way this basis counts. */
async function generationsUsed(
  basis: EntitlementBasis,
  actor: EntitlementActor,
  projectId: string,
): Promise<number> {
  const status = { in: ["QUEUED" as const, "RUNNING" as const, "SUCCEEDED" as const] };

  if (basis === "pass") {
    return prisma.generationJob.count({ where: { projectId, status } });
  }
  return prisma.generationJob.count({
    where: {
      project: { userId: actor.id },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) },
      status,
    },
  });
}

/** AI edits and assistant messages already spent. */
async function editsUsed(
  basis: EntitlementBasis,
  actor: EntitlementActor,
  projectId: string,
): Promise<number> {
  if (basis === "pass") {
    return prisma.usageRecord.count({ where: { projectId, kind: "AI_EDIT" } });
  }
  return prisma.usageRecord.count({
    where: {
      userId: actor.id,
      kind: "AI_EDIT",
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) },
    },
  });
}

/**
 * Refuses a generation run the project has no allowance for.
 *
 * The message names what to do rather than only what went wrong: a student who
 * has used their free run needs to know a pass exists, and a student who has
 * used their pass needs to know the allowance is per project rather than that
 * something is broken.
 */
export async function assertCanGenerate(
  actor: EntitlementActor,
  projectId: string,
): Promise<ProjectEntitlements> {
  const entitlements = await projectEntitlements(actor, projectId);
  if (entitlements.maxGenerations === Number.POSITIVE_INFINITY) return entitlements;

  const used = await generationsUsed(entitlements.basis, actor, projectId);
  if (used >= entitlements.maxGenerations) {
    throw new AppError("PLAN_LIMIT", {
      message: `Generation limit reached (${entitlements.basis}, ${used}/${entitlements.maxGenerations})`,
      userMessage:
        entitlements.basis === "pass"
          ? "You have used every generation run included with this project's pass. " +
            "You can still edit and rewrite the document by hand and in the assistant."
          : "You have used your free generation for this month. A project pass includes " +
            "several runs for one project, and lets you download the finished document.",
    });
  }
  return entitlements;
}

/** Refuses an AI edit or assistant message the project has no allowance for. */
export async function assertCanEdit(
  actor: EntitlementActor,
  projectId: string,
): Promise<ProjectEntitlements> {
  const entitlements = await projectEntitlements(actor, projectId);
  if (entitlements.maxEdits === Number.POSITIVE_INFINITY) return entitlements;

  const used = await editsUsed(entitlements.basis, actor, projectId);
  if (used >= entitlements.maxEdits) {
    throw new AppError("PLAN_LIMIT", {
      message: `Edit limit reached (${entitlements.basis}, ${used}/${entitlements.maxEdits})`,
      userMessage:
        entitlements.basis === "pass"
          ? "You have used every AI editing action included with this project's pass. " +
            "You can still edit the document yourself."
          : "You have used your free AI editing actions for this month. A project pass " +
            "includes far more for one project.",
    });
  }
  return entitlements;
}

/**
 * Spends an unclaimed pass on a project.
 *
 * Claiming is a transaction against the pass row rather than a read-then-write,
 * so two requests cannot spend the same pass on two projects.
 */
export async function claimPass(userId: string, projectId: string): Promise<boolean> {
  const unclaimed = await prisma.projectPass.findFirst({
    where: { userId, claimedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!unclaimed) return false;

  const claimed = await prisma.projectPass.updateMany({
    where: { id: unclaimed.id, claimedAt: null },
    data: { projectId, claimedAt: new Date() },
  });
  return claimed.count === 1;
}

/** Unclaimed passes the user is holding. */
export function unclaimedPassCount(userId: string): Promise<number> {
  return prisma.projectPass.count({ where: { userId, claimedAt: null } });
}
