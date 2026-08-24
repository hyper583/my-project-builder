import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { assertCanEdit } from "@/server/services/entitlements";
import { AppError, toUserMessage } from "@/server/errors";
import { SYSTEM_PROMPTS, ai, aiConfigured } from "@/server/services/ai";
import { buildProjectMemory } from "@/server/services/memory";
import { checkRateLimit } from "@/server/services/rate-limit";

/**
 * Streaming project assistant.
 *
 * Tokens are streamed as they arrive so the student sees an answer forming
 * rather than staring at a spinner. Both turns are persisted to
 * AIConversation / AIMessage, so the conversation survives a reload — the
 * transcript is not browser state.
 *
 * A partial answer is still saved if the stream is cut short, and labelled as
 * interrupted, rather than being silently lost.
 */

export const dynamic = "force-dynamic";

/** How many prior turns to replay. Enough for continuity, bounded for cost. */
const HISTORY_LIMIT = 12;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(8000),
  sectionId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/assistant">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser();
    const projectId = await assertProjectOwnership(id, user);

    if (!aiConfigured) throw new AppError("AI_NOT_CONFIGURED");

    const { message, sectionId, conversationId } = bodySchema.parse(await request.json());

    await checkRateLimit(`assistant:${user.id}`, ...LIMITS.rateLimit.aiAction);

    // The assistant draws on the same allowance as an edit — both are calls
    // to the model on the student's behalf.
    await assertCanEdit(user, id);

    // Reuse the named conversation only if it belongs to this project and user.
    const conversation = conversationId
      ? await prisma.aIConversation.findFirst({
          where: { id: conversationId, projectId, userId: user.id },
          select: { id: true },
        })
      : null;

    const thread =
      conversation ??
      (await prisma.aIConversation.create({
        data: { projectId, userId: user.id, title: message.slice(0, 120) },
        select: { id: true },
      }));

    const priorRows = await prisma.aIMessage.findMany({
      where: { conversationId: thread.id, role: { in: ["USER", "ASSISTANT"] } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    });
    const history = priorRows
      .reverse()
      .map((row) => ({
        role: row.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: row.content,
      }));

    await prisma.aIMessage.create({
      data: { conversationId: thread.id, role: "USER", content: message },
    });

    // Retrieval is keyed on the question, so a large source library does not
    // get sent wholesale on every turn.
    const memory = await buildProjectMemory(projectId, { query: message.slice(0, 300) });

    let sectionNote = "";
    if (sectionId) {
      const section = await prisma.projectSection.findFirst({
        where: { id: sectionId, projectId },
        select: { number: true, title: true },
      });
      if (section) {
        sectionNote = `The student is currently viewing "${[section.number, section.title]
          .filter(Boolean)
          .join(" ")}".\n\n`;
      }
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        let answer = "";

        const send = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // Client already went away.
          }
        };

        request.signal.addEventListener("abort", close);
        send("start", { conversationId: thread.id });

        try {
          const result = await ai.stream(
            {
              system: SYSTEM_PROMPTS.assistant,
              context: memory.context,
              sources: memory.sources,
              history,
              instruction: `${sectionNote}${message}`,
              maxTokens: 4000,
            },
            (delta) => {
              answer += delta;
              send("delta", { text: delta });
            },
          );

          answer = result.text || answer;

          await prisma.aIMessage.create({
            data: {
              conversationId: thread.id,
              role: "ASSISTANT",
              content: answer,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              model: result.model,
            },
          });
          await prisma.usageRecord.create({
            data: {
              userId: user.id,
              projectId,
              kind: "AI_EDIT",
              quantity: result.inputTokens + result.outputTokens,
              metadata: { surface: "assistant", model: result.model },
            },
          });

          send("done", { conversationId: thread.id });
        } catch (error) {
          // Keep whatever arrived rather than discarding the student's answer.
          if (answer.trim()) {
            await prisma.aIMessage.create({
              data: {
                conversationId: thread.id,
                role: "ASSISTANT",
                content: `${answer}\n\n[This answer was interrupted before it finished.]`,
              },
            });
          }
          console.error("[assistant] stream failed", error);
          send("error", { message: toUserMessage(error).message });
        } finally {
          close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const { code, message } = toUserMessage(error);
    const status =
      code === "UNAUTHENTICATED" ? 401 : code === "NOT_FOUND" ? 404 : code === "RATE_LIMITED" ? 429 : 400;
    return Response.json({ ok: false, code, message }, { status });
  }
}
