import { z } from "zod";

/**
 * Server environment validation.
 *
 * Parsed once at module load so a misconfigured deployment fails fast and
 * loudly at boot rather than producing a confusing runtime error later.
 * Never import this from a Client Component.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),
  /**
   * Connection pool ceiling. Left unset in normal use, where the pg default
   * applies. It exists for `prisma dev`, whose PGLite engine is compiled to
   * wasm32 and cannot serve concurrent connections: a burst of 20 queries
   * against it completes 5 with the default pool and 20 with a pool of 1.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),

  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional().or(z.literal("")),

  /**
   * Google sign-in. Optional, and both halves are required together — a client
   * id with no secret configures a provider that fails at the redirect, which
   * is worse than not offering it, so `isGoogleAuthConfigured` demands both and
   * the button is not rendered otherwise.
   */
  GOOGLE_CLIENT_ID: z.string().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal("")),

  /**
   * Paystack. The secret key both authenticates API calls and signs webhooks,
   * so it is the one value that must never reach the browser — nothing here is
   * prefixed `NEXT_PUBLIC_`.
   */
  PAYSTACK_SECRET_KEY: z.string().optional().or(z.literal("")),

  AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional().or(z.literal("")),
  AI_MODEL_GENERATION: z.string().default("claude-opus-5"),
  AI_MODEL_EDITING: z.string().default("claude-sonnet-5"),

  STORAGE_DRIVER: z.enum(["local", "supabase", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),

  /**
   * Supabase Storage. Required only when STORAGE_DRIVER=supabase, which the
   * driver checks itself so that a local installation is not asked for cloud
   * credentials it will never use.
   *
   * The service-role key bypasses row-level security, which is exactly why it
   * is server-only and has no `NEXT_PUBLIC_` twin. Every request that reaches
   * this driver has already been authorised against the project's owner; the
   * bucket is private and holds nothing that should ever be reachable by a key
   * a browser could see.
   */
  SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().or(z.literal("")),
  SUPABASE_STORAGE_BUCKET: z.string().default("project-files"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),

  EMAIL_DRIVER: z.enum(["console", "resend", "smtp"]).default("console"),

  /**
   * Resend. Required only when EMAIL_DRIVER=resend, which the driver checks
   * itself so a local installation is not asked for credentials it will never
   * use.
   *
   * `EMAIL_FROM` must be an address at a domain verified in Resend — they will
   * not send from an unverified one. It accepts a friendly form,
   * `My Project Builder <hello@example.com>`.
   */
  RESEND_API_KEY: z.string().optional().or(z.literal("")),
  EMAIL_FROM: z.string().optional().or(z.literal("")),

  /**
   * States that STORAGE_LOCAL_DIR survives a restart.
   *
   * Consulted only in production, and only to permit `STORAGE_DRIVER=local`
   * there. On a VPS with a real disk that is a perfectly good arrangement; on
   * anything serverless or container-scheduled the filesystem is discarded
   * between deploys, and every exported document and uploaded source goes with
   * it — silently, because writing to a temporary directory succeeds.
   *
   * Nothing inside the process can tell those two apart, so this asks. Saying
   * nothing is read as the dangerous case.
   */
  STORAGE_LOCAL_PERSISTENT: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function loadEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env.local and fill in the required values.`,
    );
  }

  assertProductionDrivers(parsed.data);
  return parsed.data;
}

/**
 * Refuses to start production on a development driver.
 *
 * Both defaults are deliberately safe for a laptop and quietly destructive in
 * production, and neither announces itself. The console email driver *prints*
 * the message and returns success, so registration and password reset both look
 * like they worked while nobody receives anything — an account that cannot
 * verify its email also cannot ever link a Google sign-in. Local storage
 * *writes* the file and returns success, onto a disk that a serverless host
 * discards between deploys.
 *
 * Neither failure surfaces until a real person is stuck, which is why this is a
 * refusal to boot rather than a warning in a log nobody reads. It is checked
 * here because this module is imported before anything can serve a request.
 */
function assertProductionDrivers(config: ServerEnv): void {
  if (config.NODE_ENV !== "production") return;

  /*
   * `next build` also runs as NODE_ENV=production and must not be blocked.
   *
   * A build compiles pages; it sends no email and stores no file, so the
   * drivers are irrelevant to it — and refusing here would mean the production
   * secrets had to be present on whatever machine runs the build, which is a
   * worse arrangement than the one this is guarding against. Next sets this
   * phase itself; the check that matters happens when the server starts.
   */
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const problems: string[] = [];

  if (config.EMAIL_DRIVER === "console") {
    problems.push(
      "EMAIL_DRIVER is \"console\", which prints emails to the log instead of " +
        "sending them. Password resets and email confirmation would silently " +
        'fail for every user. Set EMAIL_DRIVER="resend" with RESEND_API_KEY and ' +
        "EMAIL_FROM at a domain verified in Resend.",
    );
  }

  if (config.STORAGE_DRIVER === "local" && !config.STORAGE_LOCAL_PERSISTENT) {
    problems.push(
      'STORAGE_DRIVER is "local". On a serverless or container host that ' +
        "filesystem is discarded, taking every exported document and uploaded " +
        'source with it. Set STORAGE_DRIVER="supabase", or set ' +
        'STORAGE_LOCAL_PERSISTENT="true" if this really is a machine with a disk ' +
        "that survives a restart.",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with development drivers:\n\n` +
        problems.map((problem) => `  - ${problem}`).join("\n\n") +
        `\n\nThese are silent failures, not loud ones, which is why this stops here.`,
    );
  }
}

export const env: ServerEnv = loadEnv();

/**
 * Whether a real AI provider is configured. When false the app must show an
 * explicit "AI not configured" state rather than fabricating output.
 */
export const isAiConfigured: boolean =
  env.AI_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY);

/**
 * Whether Google sign-in can actually complete.
 *
 * Both halves or neither. The sign-in page reads this and omits the button
 * when it is false, because a visible "Continue with Google" that dead-ends at
 * Google's error page is a worse experience than an email field on its own.
 */
export const isGoogleAuthConfigured: boolean =
  Boolean(env.GOOGLE_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET);

/**
 * Whether payments can actually be taken.
 *
 * Checkout is not offered without it. A "Buy a pass" button that fails on the
 * next screen is worse than no button, and an unconfigured webhook that
 * accepted requests would be an endpoint granting passes with nothing to check
 * them against.
 */
export const isPaystackConfigured: boolean = Boolean(env.PAYSTACK_SECRET_KEY);
