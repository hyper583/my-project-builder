import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Refusing to start production on a development driver.
 *
 * Both defaults are safe on a laptop and quietly destructive in production, and
 * neither announces itself: the console email driver prints the message and
 * reports success, and the local storage driver writes the file and reports
 * success — onto a disk a serverless host throws away. Nothing fails until a
 * real person is locked out of their account or an export has vanished.
 *
 * The module is imported dynamically because it validates at load, which is
 * the behaviour being tested.
 */

const REQUIRED = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "a-secret-of-sufficient-length",
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  vi.resetModules();
});

afterEach(() => {
  process.env = saved;
  vi.resetModules();
});

/** Loads env.ts under a given environment, returning any boot error. */
async function boot(overrides: Record<string, string | undefined>): Promise<Error | null> {
  process.env = { ...REQUIRED, ...overrides } as unknown as NodeJS.ProcessEnv;
  // Not a build, unless a test says so.
  delete process.env.NEXT_PHASE;
  if (overrides.NEXT_PHASE) process.env.NEXT_PHASE = overrides.NEXT_PHASE;

  try {
    await import("@/lib/env");
    return null;
  } catch (error) {
    return error as Error;
  }
}

describe("production", () => {
  it("refuses to serve while email only goes to the log", async () => {
    const error = await boot({ NODE_ENV: "production", EMAIL_DRIVER: "console" });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/EMAIL_DRIVER/);
    expect(error!.message).toMatch(/password reset/i);
  });

  it("refuses to serve while files are written to a disk that may not persist", async () => {
    const error = await boot({
      NODE_ENV: "production",
      EMAIL_DRIVER: "resend",
      STORAGE_DRIVER: "local",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/STORAGE_DRIVER/);
  });

  it("reports every problem at once rather than one per restart", async () => {
    // Finding these one deploy at a time is the difference between a bad
    // afternoon and a bad week.
    const error = await boot({
      NODE_ENV: "production",
      EMAIL_DRIVER: "console",
      STORAGE_DRIVER: "local",
    });

    expect(error!.message).toMatch(/EMAIL_DRIVER/);
    expect(error!.message).toMatch(/STORAGE_DRIVER/);
  });

  it("allows local storage when the host is stated to have a real disk", async () => {
    // A VPS is a legitimate arrangement. The requirement is that someone said
    // so, not that the option is forbidden.
    const error = await boot({
      NODE_ENV: "production",
      EMAIL_DRIVER: "resend",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_PERSISTENT: "true",
    });

    expect(error).toBeNull();
  });

  it("starts when both drivers are real", async () => {
    const error = await boot({
      NODE_ENV: "production",
      EMAIL_DRIVER: "resend",
      STORAGE_DRIVER: "supabase",
    });

    expect(error).toBeNull();
  });
});

describe("everywhere else", () => {
  it("leaves development alone", async () => {
    // The defaults exist so a laptop needs no accounts to run the product.
    const error = await boot({
      NODE_ENV: "development",
      EMAIL_DRIVER: "console",
      STORAGE_DRIVER: "local",
    });

    expect(error).toBeNull();
  });

  it("does not block a production BUILD", async () => {
    /*
     * `next build` runs as NODE_ENV=production and sends no email and stores no
     * file. Blocking it would force production secrets onto whatever machine
     * runs the build — a worse arrangement than the one being guarded against.
     */
    const error = await boot({
      NODE_ENV: "production",
      EMAIL_DRIVER: "console",
      STORAGE_DRIVER: "local",
      NEXT_PHASE: "phase-production-build",
    });

    expect(error).toBeNull();
  });
});
