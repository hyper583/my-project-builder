import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one database, so they must not run concurrently.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    // fileURLToPath, not URL.pathname — on Windows the latter yields "/C:/..."
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
