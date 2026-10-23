import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT } from "./e2e/port";

/*
  Responsive smoke setup (A-23, T-005 AC-F2-10). Three viewports cover the
  one-nav-per-breakpoint contract: 390x844 (mobile, bottom nav), 768x1024
  (tablet, top nav), and 1280x800 (desktop, top nav).

  The dev server runs on port 3010, not the framework default 3000: in this
  environment WSL2 forwards a separate nginx service onto localhost:3000, so a
  `reuseExistingServer` health check would silently attach Playwright to nginx
  instead of Next and every request 404s. A dedicated port plus
  `reuseExistingServer: false` guarantees Playwright boots its own Next dev
  server deterministically.

  Dev mode compiles routes on first request; `global-setup.ts` pre-warms every
  route the suite touches so the six parallel workers never race a cold compile.
*/
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "on-first-retry",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `bun run dev -- -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
