"use server";

import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { findAiAction } from "@/lib/ai-actions";
import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { assertCanEdit, assertSectionUnlocked } from "@/server/services/entitlements";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";
import { SYSTEM_PROMPTS, ai, aiConfigured } from "@/server/services/ai";
import { buildProjectMemory } from "@/server/services/memory";
import { checkRateLimit } from "@/server/services/rate-limit";

/**
 * Runs a selection action against the student's highlighted text.
 *
 * The model sees the selection alongside the project's own facts, so an edit is
 * made in the context of this study rather than in isolation — which is what
 * stops "make more academic" from quietly contradicting the sample size stated
 * three chapters earlier.
 */
export async function runAiAction(input: unknown): Promise<
  ActionResult<{ text: string; replaces: boolean }>
> {
  try {
    const { projectId, sectionId, actionKey, selection } = z
      .object({
        projectId: z.string().min(1),
        sectionId: z.string().min(1),
        actionKey: z.string().min(1),
        selection: z.string().trim().min(1).max(20_000),
      })
      .parse(input);

    const user = await requireUser();
    const id = await assertProjectOwnership(projectId, user);

    if (!aiConfigured) throw new AppError("AI_NOT_CONFIGURED");

    const action = findAiAction(actionKey);
    if (!action) throw new AppError("VALIDATION", { message: `Unknown action ${actionKey}` });

    await checkRateLimit(`ai-edit:${user.id}`, ...LIMITS.rateLimit.aiAction);

    // Counted against this project's pass, or against the free monthly
    // allowance when it has none.
    const entitlements = await assertCanEdit(user, id);

    // And not on a chapter the project has not paid for. The interface cannot
    // aim here — a locked chapter has no editor to select text in — so this is
    // for requests that did not come from the interface.
    await assertSectionUnlocked(entitlements, id, sectionId);

    const section = await prisma.projectSection.findFirst({
      where: { id: sectionId, projectId: id },
      select: { number: true, title: true },
    });
    if (!section) throw new AppError("NOT_FOUND");

    const memory = await buildProjectMemory(id, { query: selection.slice(0, 300) });

    const result = await ai.edit({
      system: action.replaces ? SYSTEM_PROMPTS.edit : SYSTEM_PROMPTS.assistant,
      context: memory.context,
      sources: memory.sources,
      selection,
      instruction: [
        `The student is working on "${[section.number, section.title].filter(Boolean).join(" ")}".`,
        ``,
        action.instruction,
      ].join("\n"),
      maxTokens: 4000,
    });

    await prisma.usageRecord.create({
      data: {
        userId: user.id,
        projectId: id,
        kind: "AI_EDIT",
        quantity: result.inputTokens + result.outputTokens,
        metadata: {
          action: action.key,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: result.model,
        },
      },
    });

    return ok({ text: result.text, replaces: action.replaces });
  } catch (error) {
    return fail(error);
  }
}
