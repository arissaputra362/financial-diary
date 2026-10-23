import { defineConfig, devices } from "@playwright/test";

/*
  T-012 round 2 QA harness (QA-owned, scratch). Runs the race measurement, the
  two-tab retry conflict scenarios, and the touched-UI accessibility pass against
  a real Next dev server on its own port.

  No live Gemini or Vercel Blob call: every OCR response is intercepted in the
  browser, so the server provider and Blob client are never reached.

  Run:
    cd financial-planner-project
    bunx playwright test --config docs/qa/harness/t012-round2/t012.playwright.config.ts
*/

const PORT = Number(process.env["QA_T012_PORT"] ?? "3033");
const DB_URL =
  process.env["QA_T012_DB_URL"] ??
  "postgresql://postgres:postgres@localhost:5432/financial_planner_t003?schema=public";

export default defineConfig({
  testDir: ".",
  testMatch: "*.qa.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  timeout: 15 * 60 * 1000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `bun run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { DATABASE_URL: DB_URL },
  },
});
