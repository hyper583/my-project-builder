import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

/**
 * End-to-end configuration.
 *
 * The suite drives the real application, which means it registers users and
 * creates projects. It therefore boots its OWN Next server, on its own port,
 * pointed at the isolated test database — never the one in `.env.local`, which
 * for this project is Supabase.
 *
 * The guards below are the important part of this file. Without them a stray
 * environment would quietly fill the real database with test accounts.
 */

loadEnv({ path: ".env.test", quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. The e2e suite needs an isolated database:\n" +
      "  npx prisma dev --name mpb --detach\n" +
      "then create mpb_test, set TEST_DATABASE_URL in .env.test, and seed it:\n" +
      '  DATABASE_URL="$TEST_DATABASE_URL" npx tsx prisma/seed/index.ts',
  );
}
if (/supabase\.com|pooler\.supabase/.test(testDatabaseUrl)) {
  throw new Error("Refusing to run e2e tests against Supabase.");
}
if (!/mpb_test|_test/.test(testDatabaseUrl)) {
  throw new Error(
    `Refusing to run e2e tests against "${testDatabaseUrl}" — it is not a test database. ` +
      "These tests create users and projects.",
  );
}

/** Its own port, so a dev server on 3000 is left alone. */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",

  // One worker against one database. Parallel workers would race on the
  // shared reference data and on each other's sessions.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: testDatabaseUrl,
      // `prisma dev` runs PGLite, a wasm build that cannot serve concurrent
      // connections. Sign-out alone fires several overlapping server requests,
      // and with the default pool most of them fail with ConnectionClosed.
      // Serialising the pool matches what the engine can actually do.
      DATABASE_POOL_MAX: "1",
      BETTER_AUTH_SECRET: "e2e-test-secret-not-used-anywhere-else",
      BETTER_AUTH_URL: baseURL,
      // The suite must never spend real API credit, and must exercise the
      // "AI not configured" state the brief requires.
      AI_PROVIDER: "mock",
      ANTHROPIC_API_KEY: "",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: "./.storage-e2e",
      EMAIL_DRIVER: "console",
      NODE_ENV: "development",
    },
  },
});
