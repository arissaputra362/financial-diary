import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/*
  DB integration runner (BUG-002 / BUG-001). Runs the real services against a
  real PostgreSQL using `DATABASE_URL` (see vitest.integration.setup.ts). Kept
  separate from `bun run test` so the unit suite stays DB-free and deterministic.
  Run with: bun run test:integration
*/
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    setupFiles: ["./vitest.integration.setup.ts"],
    /* Real transactions + OCR-sized timeouts; one DB, so no file parallelism. */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
