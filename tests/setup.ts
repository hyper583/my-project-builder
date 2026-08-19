import { config } from "dotenv";

// Tests must never touch the real database. TEST_DATABASE_URL is required for
// the integration suite; unit tests do not connect at all.
config({ path: ".env.test", quiet: true });
config({ path: ".env.local", quiet: true });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
}

process.env.BETTER_AUTH_SECRET ??= "test-secret-value-at-least-16-chars";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
