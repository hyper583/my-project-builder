import { Client } from "pg";

import { ADMIN_EMAIL } from "../../playwright.config";

/**
 * Clears the one account the suite cannot make unique.
 *
 * Every other test registers a throwaway address, so runs never collide. The
 * sweep's admin cannot: promotion happens through `ADMIN_BOOTSTRAP_EMAIL`,
 * which is one fixed address the server is configured with. Left behind from a
 * previous run it holds an unknown password, so signing in fails, registering
 * fails on the duplicate, and the admin half of the sweep times out with
 * nothing to say why.
 *
 * Plain SQL rather than Prisma: Playwright compiles this file with its own
 * transpiler, and the generated client uses `import.meta`, which that
 * transpiler rejects outright. A single delete does not need an ORM.
 *
 * Only this account is removed; the rest of the accumulated test database is
 * left alone.
 */
export default async function globalSetup(): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("TEST_DATABASE_URL is not set");
  if (/supabase/.test(connectionString)) {
    throw new Error("Refusing to delete accounts from Supabase");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    // Cascades to sessions, accounts and projects.
    await client.query('DELETE FROM "user" WHERE email = $1', [ADMIN_EMAIL]);
  } finally {
    await client.end();
  }
}
