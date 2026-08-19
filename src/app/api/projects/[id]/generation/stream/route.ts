import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { toUserMessage } from "@/server/errors";

/**
 * Live generation progress (Server-Sent Events).
 *
 * Every value emitted here is read from generation_job / generation_step rows
 * written by the worker. Nothing is interpolated or animated — if a stage says
 * RUNNING, a worker is genuinely on it. The brief's "do not fake progress"
 * requirement is satisfied structurally: this route has no way to invent state.
 */

export const dynamic = "force-dynamic";

const POLL_MS = 1000;
/** Stop streaming after this long so a forgotten tab cannot hold a connection open. */
const MAX_DURATION_MS = 15 * 60 * 1000;

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/generation/stream">,
) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser();
    const projectId = await assertProjectOwnership(id, user);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const startedAt = Date.now();
        let lastPayload = "";
        let closed = false;

        const send = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed by the client disconnecting.
          }
        };

        // A client that navigates away should not leave us polling forever.
        request.signal.addEventListener("abort", close);

        while (!closed && Date.now() - startedAt < MAX_DURATION_MS) {
          const job = await prisma.generationJob.findFirst({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            include: { steps: { orderBy: { order: "asc" } } },
          });

          if (!job) {
            send("idle", { status: "NONE" });
            close();
            break;
          }

          const payload = {
            jobId: job.id,
            status: job.status,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
            error: job.error,
            steps: job.steps.map((step) => ({
              key: step.key,
              label: step.label,
              status: step.status,
              error: step.error,
            })),
          };

          // Only push when something actually changed — a 1s poll that resends
          // identical state would make the client re-render for nothing.
          const serialised = JSON.stringify(payload);
          if (serialised !== lastPayload) {
            lastPayload = serialised;
            send("progress", payload);
          }

          if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) {
            send("done", { status: job.status, error: job.error });
            close();
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }

        close();
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
    return new Response(message, { status: code === "UNAUTHENTICATED" ? 401 : 404 });
  }
}
