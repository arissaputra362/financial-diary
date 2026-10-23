import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/*
  T-005 independent QA harness runner (QA-owned, temporary).

  Kept OUT of the standard suites on purpose: the harness file uses the .qa.mts
  extension, so the unit suite's test glob never picks it up, and it lacks the
  integration suffix, so `bun run test:integration` is unaffected. Run with:

    bunx vitest run -c docs/qa/harness/t005.qa.config.mts

  It connects to the local PostgreSQL through DATABASE_URL (adapter-pg) and
  cleans up every row it creates.
*/

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig({
  root: projectRoot,
  resolve: { alias: { "@": projectRoot } },
  test: {
    include: ["docs/qa/harness/**/*.qa.mts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
