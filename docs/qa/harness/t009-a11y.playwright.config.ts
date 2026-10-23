import { defineConfig, devices } from "@playwright/test";

/*
   AC-F6-12 browser pass for T-009 (QA-owned, scratch).

   Runs the wallet UI (picker, form/manage/detail sheets, receipt viewer) in a
   real Chromium against a DISPOSABLE LOCAL database only. The dev server is
   spawned with DATABASE_URL pinned to `financial_planner_dev_t009r1` so no
   other local database (shared dev, QA) is read or written.

   No live Gemini / Vercel Blob call: the receipt-image bytes are intercepted
   inside the browser, so the server's Blob client is never reached.

   Run:
     cd financial-planner-project
     bunx playwright test --config docs/qa/harness/t009-a11y.playwright.config.ts
*/

const DISPOSABLE_DB =
  process.env["QA_T009_DB_URL"] ??
  "postgresql://postgres:postgres@localhost:5432/financial_planner_dev_t009r1?schema=public";
const PORT = Number(process.env["QA_T009_PORT"] ?? "3024");

export default defineConfig({
  testDir: ".",
  testMatch: "t009-*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  expect: { timeout: 20_000 },
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
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
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
    env: { DATABASE_URL: DISPOSABLE_DB },
  },
});

