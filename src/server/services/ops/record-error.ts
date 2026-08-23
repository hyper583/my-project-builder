import { AppError, type AppErrorCode } from "@/server/errors";
import { prisma } from "@/server/db";

/**
 * Persists a server fault so it can be investigated after the fact.
 *
 * Only faults. `VALIDATION` and `PLAN_LIMIT` are normal events — someone typed
 * something wrong, or reached the ceiling their plan says they have — and
 * recording them would bury real incidents under ordinary use.
 */
const RECORDED: ReadonlySet<string> = new Set<AppErrorCode>([
  "INTERNAL",
  "AI_FAILED",
  "EXPORT_FAILED",
  "DOCUMENT_UNREADABLE",
  "GENERATION_INTERRUPTED",
]);

/** How much of a message is kept in the summary shown without revealing. */
const SUMMARY_LIMIT = 160;

export function isRecordable(code: string): boolean {
  return RECORDED.has(code);
}

/**
 * Reduces a message to something safe to show in a list.
 *
 * An AI_FAILED error can carry a chunk of the student's draft, and an upload
 * error can carry document text. The full message is kept in `detail` behind
 * the reveal-and-audit gate; this is what an admin sees before they ask.
 *
 * The rule is structural rather than clever: keep the first line, cap it, and
 * collapse anything that looks like prose. Trying to detect student writing
 * heuristically would fail in exactly the cases that matter.
 */
export function summarise(message: string): string {
  const firstLine = message.split("\n", 1)[0]!.trim();
  if (firstLine.length <= SUMMARY_LIMIT) return firstLine;
  return `${firstLine.slice(0, SUMMARY_LIMIT).trimEnd()}…`;
}

export interface RecordErrorInput {
  readonly error: unknown;
  /** Where it happened — a route, an action name, or a worker stage. */
  readonly origin: string;
  readonly userId?: string | null;
  readonly projectId?: string | null;
}

/**
 * Writes an error record, and never throws.
 *
 * A logging failure must not break the request it is describing — that would
 * turn a recoverable fault into an outage, and lose the original error on the
 * way. If this cannot write, it gives up quietly and the console simply has one
 * fewer row.
 */
export async function recordError(input: RecordErrorInput): Promise<void> {
  try {
    const code = input.error instanceof AppError ? input.error.code : "INTERNAL";
    if (!isRecordable(code)) return;

    const message =
      input.error instanceof Error ? input.error.message : String(input.error ?? "Unknown error");
    const stack = input.error instanceof Error ? (input.error.stack ?? null) : null;

    await prisma.errorLog.create({
      data: {
        code,
        summary: summarise(message),
        detail: message,
        stack: stack ? stack.slice(0, 8000) : null,
        origin: input.origin.slice(0, 200),
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
      },
    });
  } catch {
    // Deliberately silent. See the docblock.
  }
}
