import { prisma } from "@/server/db";

/**
 * Integration-test database access.
 *
 * Tests share the application's Prisma client rather than opening a second
 * one. `prisma dev` runs PGLite, a wasm build that serves exactly one client:
 * measured directly, one client works and two fail with "Server has closed the
 * connection". Since these tests exercise real services — which import the
 * app's singleton — a separate test client would be that fatal second
 * connection.
 *
 * The isolation this used to provide now comes from `tests/setup.ts`, which
 * redirects DATABASE_URL to TEST_DATABASE_URL and throws outright if the
 * result points at Supabase. That is a stronger guarantee than a second
 * client, because it protects the services too rather than only these helpers.
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    [
      "TEST_DATABASE_URL is not set. Integration tests need an isolated database:",
      "  npx prisma dev --name mpb --detach",
      "then create mpb_test and set TEST_DATABASE_URL in .env.test",
    ].join("\n"),
  );
}
if (!/mpb_test|_test/.test(url)) {
  throw new Error(
    `Refusing to run integration tests against "${url}" — it is not a test database. ` +
      "These tests truncate tables.",
  );
}
if (/supabase\.com|pooler\.supabase/.test(url)) {
  throw new Error("Refusing to run integration tests against Supabase.");
}

export const db = prisma;

const TRUNCATE_ALL = `
  TRUNCATE TABLE
    "audit_log", "usage_record", "export", "subscription", "project_pass",
    "ai_message", "ai_conversation",
    "project_version", "generation_step", "generation_job",
    "project_citation", "project_reference",
    "document_chunk", "document_extraction", "project_source", "project_document",
    "section_placeholder", "project_section",
    "project_formatting", "project_instruction", "project_variable",
    "project_methodology", "project_research_details", "project_institution",
    "project", "session", "account", "user"
  RESTART IDENTITY CASCADE
`;

/**
 * Clears all project and user data between tests. Reference data is untouched.
 *
 * Retries once after reconnecting, because PGLite closes the connection when a
 * statement raises — and several tests deliberately provoke an error to prove
 * a database constraint holds. With a pool of one there is no spare socket, so
 * the next test would otherwise fail on a dead connection rather than on
 * anything it was testing. A real Postgres keeps the session, so this is a
 * property of the wasm test engine and not of the application.
 */
export async function resetDatabase(): Promise<void> {
  try {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
  } catch {
    await db.$disconnect();
    await db.$connect();
    await db.$executeRawUnsafe(TRUNCATE_ALL);
  }
}

/**
 * Runs a query, reconnecting once if the connection was closed underneath it.
 *
 * PGLite drops the connection whenever a statement raises, and several tests
 * deliberately provoke an error to prove a database constraint holds. The
 * follow-up assertion then lands on a dead socket — intermittently, depending
 * on pool timing, which is worse than failing every time. A real Postgres
 * keeps the session, so this exists purely for the wasm test engine.
 */
export async function resilient<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await db.$disconnect();
    await db.$connect();
    return run();
  }
}

let counter = 0;

export async function createUser(overrides: Partial<{ role: "STUDENT" | "ADMIN"; planTier: "FREE" | "PAID" }> = {}) {
  counter += 1;
  return db.user.create({
    data: {
      name: `Test User ${counter}`,
      email: `test-${counter}-${Date.now()}@example.com`,
      role: overrides.role ?? "STUDENT",
      planTier: overrides.planTier ?? "FREE",
    },
  });
}

export async function createProject(userId: string, overrides: Partial<{ kind: "REAL" | "DEMO"; title: string }> = {}) {
  return db.project.create({
    data: {
      userId,
      title: overrides.title ?? "Test Project",
      kind: overrides.kind ?? "REAL",
    },
  });
}
