import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/*
  T-007 independent QA harness runner (QA-owned, temporary).

  Same pattern as t005.qa.config.mts but includes ONLY t007 files, so the T-005
  harness is not re-executed here. Run with:

    bunx vitest run -c docs/qa/harness/t007.qa.config.mts

  Connects to the local PostgreSQL through DATABASE_URL (adapter-pg), exercises
  the REAL GoalService/AdvisorService with an injected fake AdvisorProvider,
  cross-checks against raw SQL, and cleans up every row it creates.
*/

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig({
  root: projectRoot,
  resolve: { alias: { "@": projectRoot } },
  test: {
    include: ["docs/qa/harness/t007*.qa.mts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
