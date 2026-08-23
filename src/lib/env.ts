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

  AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional().or(z.literal("")),
  AI_MODEL_GENERATION: z.string().default("claude-opus-5"),
  AI_MODEL_EDITING: z.string().default("claude-sonnet-5"),

  STORAGE_DRIVER: z.enum(["local", "supabase", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),

  EMAIL_DRIVER: z.enum(["console", "smtp"]).default("console"),
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
  return parsed.data;
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
