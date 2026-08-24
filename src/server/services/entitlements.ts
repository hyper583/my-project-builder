import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  FREE_LIFETIME_PROJECTS,
  FREE_PROJECT_ALLOWANCE,
  PASS_ALLOWANCE,
} from "@/config/plans";

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
 * Generation runs are a quota on the PROJECT under both bases — one run for a
 * free project, three for a passed one — with no window under either. A window
 * was the previous design for the free basis and it punished the wrong people:
 * a student starting a second project had to wait thirty days to see a word of
 * it. What has to be bounded per human is how many projects are given away,
 * and that is `FREE_LIFETIME_PROJECTS`, checked separately below.
 *
 * `maxChapters` is the difference that matters commercially. A free project is
 * written as far as Chapter 1 and no further, so the rest of the document does
 * not exist to be copied. The previous arrangement generated all of it and
 * relied on the Export button to withhold it, which withheld nothing — the
 * prose was on screen, and selecting it was the entire bypass.
 */

export type EntitlementBasis = "admin" | "pass" | "free";

export interface ProjectEntitlements {
  readonly basis: EntitlementBasis;
  /** May the finished document be downloaded? */
  readonly canExport: boolean;
  readonly maxGenerations: number;
  readonly maxEdits: number;
  /**
   * How many chapters a generation run may write, and — as a second line of
   * defence — how many the workspace will serve the text of.
   */
  readonly maxChapters: number;
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
  maxChapters: Number.POSITIVE_INFINITY,
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

  const [pass, project] = await Promise.all([
    prisma.projectPass.findUnique({
      where: { projectId },
      select: { claimedAt: true, userId: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { kind: true } }),
  ]);

  // Someone else's pass on a project they own is not this actor's to spend;
  // ownership is enforced before this is ever reached, and this is the belt.
  if (pass?.claimedAt && pass.userId === actor.id) {
    return { basis: "pass", canExport: true, ...PASS_ALLOWANCE };
  }

  /*
   * The sample project is readable end to end, and must stay that way.
   *
   * It exists to show a student what a finished five-chapter project looks
   * like before they commit to anything, so locking four fifths of it would
   * remove the only thing it is for. There is nothing to protect: the text is
   * fixture content, identical for every account, describing no real study —
   * and it cannot be handed in, because every export of it carries a
   * watermark, a title-page notice and a footer on every page.
   *
   * `canExport` stays false. Reading the sample is the point; downloading it
   * is governed by `PLANS[...].canExportDemo`, which is a separate decision and
   * is not what this line is for.
   */
  if (project?.kind === "DEMO") {
    return {
      basis: "free",
      canExport: false,
      ...FREE_PROJECT_ALLOWANCE,
      maxChapters: Number.POSITIVE_INFINITY,
    };
  }

  return { basis: "free", canExport: false, ...FREE_PROJECT_ALLOWANCE };
}

/**
 * Generation runs already spent on this project.
 *
 * A cancelled or failed run is deliberately not counted — the student got
 * nothing for it. QUEUED and RUNNING are, so double-clicking Generate cannot
 * slip a second run past the check while the first is still in flight.
 */
function generationsUsed(projectId: string): Promise<number> {
  return prisma.generationJob.count({
    where: {
      projectId,
      status: { in: ["QUEUED", "RUNNING", "SUCCEEDED"] },
    },
  });
}

/**
 * How many distinct projects this account has had written for free.
 *
 * DISTINCT PROJECTS, not rows, and the distinction is not pedantry — it is the
 * bug this function was first written with. The pipeline records one
 * `AI_GENERATION` usage row per model call, so a single run leaves about
 * twenty-five of them. Counting rows made a student who had generated one
 * project look like they had used eighty-nine free runs, and the dashboard
 * cheerfully said so.
 *
 * Grouping by project also happens to be the rule itself, stated directly: one
 * free project, twice. Nothing has to agree about what counts as "a run".
 *
 * Read from `UsageRecord` rather than `GenerationJob`, because this number has
 * to outlive the project it was spent on. `GenerationJob` is `onDelete:
 * Cascade`; `UsageRecord.projectId` is a plain column with no relation at all.
 * Nothing hard-deletes a project today, so both would agree right now — the
 * difference is what happens the day a retention job or an admin tool is added
 * and quietly hands every account its free projects back.
 *
 * "Free" is derived rather than stored: a project counts unless it now carries
 * a pass. So a student who writes Chapter 1 free and then buys a pass for that
 * project gets their free allowance back. That is the right way round — they
 * paid — and it cannot be farmed, because getting it back costs ₦25,000.
 */
export async function freeProjectsGenerated(userId: string): Promise<number> {
  const passed = await prisma.projectPass.findMany({
    where: { userId, projectId: { not: null } },
    select: { projectId: true },
  });

  const projects = await prisma.usageRecord.groupBy({
    by: ["projectId"],
    where: {
      userId,
      kind: "AI_GENERATION",
      // Both clauses are needed. `notIn` on its own drops NULLs in SQL, but an
      // EMPTY `notIn` list is optimised away entirely — which would let usage
      // rows with no project at all be counted as projects.
      projectId: { not: null, notIn: passed.map((p) => p.projectId!) },
    },
  });

  return projects.length;
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

  const used = await generationsUsed(projectId);
  if (used >= entitlements.maxGenerations) {
    throw new AppError("PLAN_LIMIT", {
      message: `Generation limit reached (${entitlements.basis}, ${used}/${entitlements.maxGenerations})`,
      userMessage:
        entitlements.basis === "pass"
          ? "You have used every generation run included with this project's pass. " +
            "You can still edit and rewrite the document by hand and in the assistant."
          : "You have already used the free run for this project. A project pass writes " +
            "the remaining chapters, includes several more runs, and lets you download " +
            "the finished document.",
    });
  }

  /*
   * The per-account bound, checked only for free runs.
   *
   * The per-project check above cannot do this job on its own: a student's own
   * delete is soft, and the active-project cap counts only undeleted projects,
   * so delete-and-recreate would hand out free runs forever.
   */
  if (entitlements.basis === "free") {
    const lifetime = await freeProjectsGenerated(actor.id);
    if (lifetime >= FREE_LIFETIME_PROJECTS) {
      throw new AppError("PLAN_LIMIT", {
        message: `Free project limit reached (${lifetime}/${FREE_LIFETIME_PROJECTS})`,
        userMessage:
          `Free projects are limited to ${FREE_LIFETIME_PROJECTS} across your account, ` +
          "and you have used them. A project pass writes a project in full — every " +
          "chapter, with the finished document to download.",
      });
    }
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
 * Refuses work aimed at a chapter this project's allowance does not cover.
 *
 * The selection actions take a `sectionId` from the browser, and the interface
 * cannot offer a locked one — there is no editor on a locked chapter to select
 * text in. That makes this unreachable through the product and reachable by
 * anyone willing to post the request themselves, which is the definition of a
 * check that has to exist on the server.
 *
 * Left unguarded it is a way round the whole gate: name a locked section, send
 * your own text as the selection, and ask for it to be expanded.
 */
export async function assertSectionUnlocked(
  entitlements: ProjectEntitlements,
  projectId: string,
  sectionId: string,
): Promise<void> {
  if (!Number.isFinite(entitlements.maxChapters)) return;

  const section = await prisma.projectSection.findFirst({
    where: { id: sectionId, projectId },
    select: { id: true, parentId: true },
  });
  // A section that does not exist is the caller's NOT_FOUND to report, not a
  // lock. Returning here keeps the two failures distinguishable.
  if (!section) return;

  const chapters = await prisma.projectSection.findMany({
    where: { projectId, parentId: null },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  // A leaf's chapter is its parent; a chapter is its own.
  const chapterId = section.parentId ?? section.id;
  const position = chapters.findIndex((chapter) => chapter.id === chapterId);

  if (position >= entitlements.maxChapters) {
    throw new AppError("PLAN_LIMIT", {
      message: `Section ${sectionId} is beyond the allowance (chapter ${position + 1} of ${entitlements.maxChapters})`,
      userMessage:
        "That chapter is part of a project pass. Buy one to write and edit the whole project.",
    });
  }
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
