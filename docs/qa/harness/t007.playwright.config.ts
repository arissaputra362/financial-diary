import { defineConfig, devices } from "@playwright/test";

/* T-007 QA viewport spec runner (QA-owned, scratch). Requires a dev server already
   running on QA_BASE (:3010); GATE: never port 3000. */
const baseURL = process.env.QA_BASE || "http://localhost:3010";
export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "off" },
  projects: [
    { name: "mobile390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
});
