import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { devFixtureEmail, signUpOwner } from "../../../../e2e/helpers";

/*
  T-012 round 2: measured reproduction of the BUG-1 race from round 1.

  `/transactions` -> open via the global Tambah action -> close via X / Batal /
  Escape / backdrop -> tap the global Tambah again at 0 / 50 / 100 / 150 ms with
  no URL cleanup wait. Every attempt must open a clean sheet, must not leave
  `?add=1` behind, must not grow history, and must keep the month / Trash view.

  The round 1 report measured 5/12 failures at 0 ms and 4/8 at 100 ms with the
  old code, so 20 iterations per delay per close path gives a decisive sample.
*/

const CLOSE_PATHS = ["X", "Batal", "Escape", "backdrop"] as const;
type ClosePath = (typeof CLOSE_PATHS)[number];
const DELAYS = [0, 50, 100, 150] as const;
const ITERATIONS = Number(process.env["QTA_RACE_ITERATIONS"] ?? 12);

async function closeSheet(page: Page, path: ClosePath): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  if (path === "X") {
    await page.getByRole("button", { name: "Tutup" }).click();
  } else if (path === "Batal") {
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  } else if (path === "Escape") {
    await page.keyboard.press("Escape");
  } else {
    await page.mouse.click(6, 6);
  }
  await expect(dialog).toHaveCount(0);
}

type Bucket = {
  attempts: number;
  opened: number;
  stayedOpen: number;
  cleanUrl: number;
  historyStable: number;
  viewPreserved: number;
  latencies: number[];
  addPresentAtClose: number;
  failures: string[];
};

function emptyBucket(): Bucket {
  return {
    attempts: 0,
    opened: 0,
    stayedOpen: 0,
    cleanUrl: 0,
    historyStable: 0,
    viewPreserved: 0,
    latencies: [],
    addPresentAtClose: 0,
    failures: [],
  };
}

function navScope(page: Page): Locator {
  const width = page.viewportSize()?.width ?? 0;
  return page.locator(width < 768 ? '[data-nav="bottom"]' : '[data-nav="top"]');
}

test("BUG-1 measured race: close then global Add at 0/50/100/150 ms", async ({ page }, testInfo) => {
  await signUpOwner(page, devFixtureEmail());
  const trigger = navScope(page).getByRole("link", { name: "Tambah transaksi" });
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  const results: Record<string, Bucket> = {};

  for (const path of CLOSE_PATHS) {
    for (const view of ["month", "trash"] as const) {
      const startUrl = view === "trash" ? "/transactions?view=trash" : "/transactions?month=2025-03";
      await page.goto(startUrl);
      await expect(page.getByRole("tab", { name: view === "trash" ? "Trash" : "Transaksi" })).toBeVisible();

      for (const delay of DELAYS) {
        const key = `${path}|${view}|${delay}ms`;
        const bucket = (results[key] = emptyBucket());

        for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
          bucket.attempts += 1;
          let recovered = false;

          await trigger.click();
          await expect(dialog).toBeVisible();
          const historyBefore = await page.evaluate(() => history.length);

          await closeSheet(page, path);
          if (delay > 0) await page.waitForTimeout(delay);

          /* Informational: was add=1 still in the URL at the instant of reopen? */
          if (/add=1/.test(page.url())) bucket.addPresentAtClose += 1;

          /* The race under test: tap the global Add again immediately. */
          await trigger.click();

          const started = Date.now();
          let opened = true;
          try {
            await dialog.waitFor({ state: "visible", timeout: 1500 });
          } catch {
            opened = false;
          }
          const latency = Date.now() - started;
          bucket.latencies.push(latency);
          if (!opened) {
            bucket.failures.push(`${key}#${iteration}: sheet did not open within 1500ms`);
            recovered = true;
          } else {
            bucket.opened += 1;
            /* A late URL/state write must not close the freshly opened sheet. */
            await page.waitForTimeout(350);
            const stillOpen = await dialog.isVisible();
            if (!stillOpen) {
              bucket.failures.push(`${key}#${iteration}: sheet opened then closed during settle`);
            } else {
              bucket.stayedOpen += 1;
              const cleanState = await dialog
                .getByRole("tab", { name: "Isi manual" })
                .getAttribute("aria-selected");
              const amount = await page.locator("#amount").inputValue();
              if (cleanState !== "true" || amount !== "") {
                bucket.failures.push(
                  `${key}#${iteration}: reopened sheet was not clean (tab=${cleanState}, amount=${amount})`,
                );
              }
            }
          }

          if (opened) {
            const historyAfterReopen = await page.evaluate(() => history.length);
            if (historyAfterReopen === historyBefore) bucket.historyStable += 1;
            else {
              bucket.failures.push(
                `${key}#${iteration}: history grew ${historyBefore} -> ${historyAfterReopen}`,
              );
            }

            /* Close again, then require a clean URL and the preserved view. */
            await closeSheet(page, "X");
            let cleanUrl = true;
            try {
              await expect(page).not.toHaveURL(/add=1/, { timeout: 2000 });
            } catch {
              cleanUrl = false;
            }
            if (cleanUrl) bucket.cleanUrl += 1;
            else bucket.failures.push(`${key}#${iteration}: add=1 remained after close`);

            let preserved = true;
            try {
              if (view === "trash") {
                await expect(page).toHaveURL(/view=trash/);
                await expect(page.getByRole("tab", { name: "Trash" })).toHaveAttribute(
                  "aria-selected",
                  "true",
                );
              } else {
                await expect(page).toHaveURL(/month=2025-03/);
                await expect(page.getByText("Maret 2025", { exact: true })).toBeVisible();
              }
            } catch {
              preserved = false;
            }
            if (preserved) bucket.viewPreserved += 1;
            else bucket.failures.push(`${key}#${iteration}: month/trash view was lost`);
          }

          if (recovered) {
            await page.goto(startUrl);
            await expect(dialog).toHaveCount(0);
          }
        }
      }
    }
  }

  const summary = Object.fromEntries(
    Object.entries(results).map(([key, bucket]) => [
      key,
      {
        attempts: bucket.attempts,
        opened: bucket.opened,
        stayedOpen: bucket.stayedOpen,
        cleanUrl: bucket.cleanUrl,
        historyStable: bucket.historyStable,
        viewPreserved: bucket.viewPreserved,
        addPresentAtClose: bucket.addPresentAtClose,
        maxLatencyMs: Math.max(...bucket.latencies),
        medianLatencyMs: [...bucket.latencies].sort((a, b) => a - b)[Math.floor(bucket.latencies.length / 2)],
        failures: bucket.failures.slice(0, 5),
      },
    ]),
  );

  const totals = Object.values(results).reduce(
    (acc, bucket) => ({
      attempts: acc.attempts + bucket.attempts,
      opened: acc.opened + bucket.opened,
      stayedOpen: acc.stayedOpen + bucket.stayedOpen,
      cleanUrl: acc.cleanUrl + bucket.cleanUrl,
      historyStable: acc.historyStable + bucket.historyStable,
      viewPreserved: acc.viewPreserved + bucket.viewPreserved,
      addPresentAtClose: acc.addPresentAtClose + bucket.addPresentAtClose,
    }),
    { attempts: 0, opened: 0, stayedOpen: 0, cleanUrl: 0, historyStable: 0, viewPreserved: 0, addPresentAtClose: 0 },
  );

  const artifact = join(__dirname, "results-race.json");
  writeFileSync(artifact, JSON.stringify({ project: testInfo.project.name, totals, perCase: summary }, null, 2));
  testInfo.attach("race-results", { path: artifact, contentType: "application/json" });
  console.log(`[RACE ${testInfo.project.name}] ${JSON.stringify({ totals, perCase: summary })}`);

  expect(totals.opened, "every close+reopen attempt must open the sheet").toBe(totals.attempts);
  expect(totals.stayedOpen).toBe(totals.attempts);
  expect(totals.cleanUrl).toBe(totals.attempts);
  expect(totals.historyStable).toBe(totals.attempts);
  expect(totals.viewPreserved).toBe(totals.attempts);
});



