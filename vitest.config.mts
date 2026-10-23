import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/*
  Unit test runner for pure logic (A-23). The `@` alias mirrors the `paths`
  mapping in tsconfig.json so tests import modules the same way app code does.
  E2E lives in Playwright, not here.
*/
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    /* DB integration suites run via vitest.integration.config.mts (test:integration). */
    exclude: ["node_modules/**", ".next/**", "e2e/**", "**/*.integration.test.ts"],
  },
});
