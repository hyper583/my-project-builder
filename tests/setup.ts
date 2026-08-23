import { config } from "dotenv";

// Tests must never touch the real database. TEST_DATABASE_URL is required for
// the integration suite; unit tests do not connect at all.
config({ path: ".env.test", quiet: true });
config({ path: ".env.local", quiet: true });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
}

/*
 * Integration tests exercise real services, which import the app's Prisma
 * singleton and therefore read DATABASE_URL. Without this guard, running them
 * with TEST_DATABASE_URL unset would silently fall through to the value in
 * .env.local — which for this project is Supabase — and write test fixtures
 * into real data. Failing to start is the only acceptable outcome.
 */
if (/supabase\.com|pooler\.supabase/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error(
    "Refusing to run tests against Supabase. Set TEST_DATABASE_URL in .env.test:\n" +
      "  npx prisma dev --name mpb --detach",
  );
}

/*
 * `prisma dev` runs PGLite, a wasm build that serves exactly one client and
 * cannot handle concurrent connections: measured directly, a burst of 20
 * queries completes 5 with the default pool and 20 with a pool of one.
 * Integration tests exercise real services, which issue overlapping queries.
 */
process.env.DATABASE_POOL_MAX ??= "1";

process.env.BETTER_AUTH_SECRET ??= "test-secret-value-at-least-16-chars";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
