import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Integration-test database access.
 *
 * A dedicated client is used rather than the app's singleton so a test can
 * never accidentally run against the configured application database. The
 * guard below refuses to run at all unless TEST_DATABASE_URL is set and
 * clearly points at a test database.
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Integration tests need an isolated database:\n" +
      "  npx prisma dev --name mpb --detach\n" +
      "then create mpb_test and set TEST_DATABASE_URL in .env.test",
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

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/** Clears all project and user data between tests. Reference data is untouched. */
export async function resetDatabase(): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_log", "usage_record", "export", "subscription",
      "ai_message", "ai_conversation",
      "project_version", "generation_step", "generation_job",
      "project_citation", "project_reference",
      "document_chunk", "document_extraction", "project_source", "project_document",
      "section_placeholder", "project_section",
      "project_formatting", "project_instruction", "project_variable",
      "project_methodology", "project_research_details", "project_institution",
      "project", "session", "account", "user"
    RESTART IDENTITY CASCADE
  `);
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
