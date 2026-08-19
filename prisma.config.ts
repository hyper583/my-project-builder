import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Next.js reads .env.local; the Prisma CLI does not, so load it explicitly.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed/index.ts",
  },
  // The CLI must use the DIRECT connection. Migrating through a pgBouncer
  // pooler fails with: prepared statement "s0" already exists.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
