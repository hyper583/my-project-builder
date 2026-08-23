import { toNextJsHandler } from "better-auth/next-js";
import { headers } from "next/headers";

import { LIMITS } from "@/config/limits";
import { auth } from "@/server/auth";
import { checkRateLimit } from "@/server/services/rate-limit";

const handler = toNextJsHandler(auth);

/**
 * Matched as a SEGMENT, not a suffix.
 *
 * Better Auth routes the provider after the verb — the real path is
 * `/api/auth/sign-in/email`, which ends in `/email`. An `endsWith` check
 * against "/sign-in" matches none of these, which is how the first version of
 * this guard let twelve consecutive failed sign-ins through without ever
 * returning 429.
 *
 * `/sign-out` deliberately does not appear: it is served through the same
 * catch-all, and throttling it would log people out of an app they are
 * legitimately using.
 */
const CREDENTIAL_PATHS = [
  "/sign-in",
  "/sign-up",
  "/forget-password",
  "/reset-password",
  "/change-password",
];

/**
 * The caller's address, used only as a fallback throttling key.
 *
 * `x-forwarded-for` is client-supplied and can be forged, so this is never
 * identity. An attacker who spoofs it spreads their attempts across buckets
 * rather than escaping them, which is a far smaller problem than no limit.
 */
function callerAddress(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",", 1)[0]!.trim();
  return requestHeaders.get("x-real-ip")?.trim() || "unknown";
}

/**
 * What the attempts are counted against.
 *
 * The ACCOUNT, not the address, wherever an email is supplied. This matters
 * more than it first appears: the students this is built for share campus
 * connections, and hundreds of them can sit behind one NAT. Keying by address
 * would let one person's fat-fingered password lock out an entire university —
 * and the threat being defended against is guessing at a particular account,
 * which is exactly what an email-keyed bucket measures.
 *
 * Address is the fallback for requests that carry no email, so a malformed
 * body cannot slip past uncounted.
 *
 * The body is read from a CLONE. Consuming the original would leave Better
 * Auth with an empty stream and break every sign-in that this guard allows.
 */
async function attemptKey(request: Request, path: string): Promise<string> {
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    if (typeof body.email === "string" && body.email.trim()) {
      return `auth:${path}:email:${body.email.trim().toLowerCase()}`;
    }
  } catch {
    // Not JSON, or no body. Fall through to the address.
  }
  return `auth:${path}:ip:${callerAddress(await headers())}`;
}

/**
 * Rate-limits credential attempts before Better Auth sees them.
 *
 * `LIMITS.rateLimit.authAttempt` had been defined since the first milestone and
 * wired to nothing, so sign-in and registration had no brute-force or
 * credential-stuffing protection at all. Every expensive AI operation was
 * limited; the one endpoint an attacker actually hammers was not.
 */
export async function POST(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;

  if (CREDENTIAL_PATHS.some((segment) => path.includes(segment))) {
    try {
      await checkRateLimit(await attemptKey(request, path), ...LIMITS.rateLimit.authAttempt);
    } catch {
      // Deliberately vague, and identical whether or not the account exists.
      // A precise message here is a signal an attacker can measure.
      return Response.json(
        { message: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429 },
      );
    }
  }

  return handler.POST(request);
}

export const { GET } = handler;
