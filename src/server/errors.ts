import { ZodError } from "zod";
/**
 * Application error taxonomy.
 *
 * Users never see a stack trace or a raw database message. Every error thrown
 * across a server boundary is mapped to one of these codes, and each code has a
 * friendly message. Technical detail stays in `cause` and is logged server-side.
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "UPLOAD_REJECTED"
  | "DOCUMENT_UNREADABLE"
  | "AI_NOT_CONFIGURED"
  | "AI_FAILED"
  | "GENERATION_INTERRUPTED"
  | "EXPORT_FAILED"
  | "PLAN_LIMIT"
  | "CONFLICT"
  | "INTERNAL";

const FRIENDLY: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You do not have access to this.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  VALIDATION: "Some of the details entered aren't valid. Please check and try again.",
  RATE_LIMITED: "That's a lot of requests in a short time. Please wait a moment and try again.",
  UPLOAD_REJECTED: "That file couldn't be accepted. Check the file type and size, then try again.",
  DOCUMENT_UNREADABLE: "Your document couldn't be processed. Try uploading it again.",
  AI_NOT_CONFIGURED: "AI features aren't configured yet on this installation.",
  AI_FAILED: "The AI request didn't complete. Your work is safe — please try again.",
  GENERATION_INTERRUPTED: "AI generation was interrupted. Your completed sections are safe.",
  EXPORT_FAILED: "Export failed. Please try again.",
  PLAN_LIMIT: "This is included on a paid plan. Upgrade to continue.",
  CONFLICT: "This was changed somewhere else. Reload the page to get the latest version.",
  INTERNAL: "Something went wrong on our end. Please try again.",
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Safe to show to the user. */
  readonly userMessage: string;

  /**
   * `message` is internal — it goes to logs and never to the client, so it is
   * safe to put a project id or a provider name in it.
   *
   * `userMessage` is the opt-in for text that SHOULD be shown. It exists
   * because the two are genuinely different jobs, and defaulting to the
   * friendly table is what stops an unexamined `message` leaking. A policy
   * refusal an admin needs to read — "that is the only active admin" — is
   * useless if it renders as "check your details", and seventeen call sites
   * were passing a message that never reached anyone.
   */
  constructor(
    code: AppErrorCode,
    options?: { message?: string; userMessage?: string; cause?: unknown },
  ) {
    super(options?.message ?? options?.userMessage ?? code, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.userMessage = options?.userMessage ?? FRIENDLY[code];
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convert any thrown value into a user-safe message, logging the technical
 * detail server-side. Unknown errors never leak their content to the client.
 */
export function toUserMessage(error: unknown): { code: AppErrorCode; message: string } {
  if (isAppError(error)) {
    return { code: error.code, message: error.userMessage };
  }

  /*
   * A schema failure is the user's input being wrong, not the server breaking.
   * Without this it fell through to INTERNAL and reported "something went wrong
   * on our end" — which is both untrue and unactionable, and it silently
   * discarded every message authored in a schema.
   *
   * Zod's messages describe the schema rather than the data, and the ones that
   * matter here are written in this codebase, so they are safe to show.
   */
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return { code: "VALIDATION", message: first?.message ?? FRIENDLY.VALIDATION };
  }

  console.error("[unhandled]", error);
  return { code: "INTERNAL", message: FRIENDLY.INTERNAL };
}

/** Typed result envelope for server actions. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AppErrorCode; message: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  const { code, message } = toUserMessage(error);
  return { ok: false, code, message };
}
