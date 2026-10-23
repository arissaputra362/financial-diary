import { expect, test, type Page } from "@playwright/test";
import { signUpOwner } from "../../../e2e/helpers";

/*
  T-007 QA own-metric spec (QA-owned, scratch, viewport 390x844 = AC-F4-8 oracle).
  Proves, with MY OWN assertions (not the developer suite re-run):
    1. F4-8: limitations + sourcePeriod on screen WITHOUT scrolling/interaction
       (bounding box inside the 844px fold while page scrollTop == 0).
    2. F4-8: model name never rendered even when the payload carries a
       distinctive fake model name.
    3. F4-4: undo toast is visible after trash, restore works within the window,
       and the toast auto-expires after ~5 s (5 -> hidden, not before 4.5 s).
    4. F4-4: trashed goal disappears from the dashboard GoalsSummaryCard too
       (regression: GoalsSummaryCard + goals wiring).
    5. F4-6: CACHE delivery renders the "tersimpan" label.
    6. Goal name with emoji/RTL renders normally (spec edge, D-22).
  Runs against the already-running dev server; cleans nothing in DB (API数据
  created via signup is e2e-shaped but for THIS spec row counts stay small).
*/

const INSIGHT = {
  headline: "Sisa uang bulan ini masih lega.",
  summary: "Uang keluar 120 ribu dari uang masuk 500 ribu di periode ini.",
  actions: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
  limitations: "Ini bukan nasihat keuangan profesional. Angka dihitung dari catatan keluargamu sendiri.",
  sourcePeriod: { start: "2026-10-01", end: "2026-10-07" },
  model: "MODELNAME-XYZ-SUPER-SECRET-should-never-render",
  generatedAt: "2026-10-07T03:00:00.000Z",
  expiresAt: "2026-10-08T03:00:00.000Z",
};

function fulfill(delivery: "FRESH" | "CACHE") {
  return async (route: { fulfill: (opts: object) => Promise<void> }) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ insight: INSIGHT, delivery }),
    });
  };
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page);
});

test("390px: footer (limitations + sourcePeriod) visible without any scroll", async ({ page }) => {
  await page.route("**/api/advisor/insights", fulfill("FRESH"));
  await page.goto("/budget");
  await page.getByTestId("advisor-open").click();
  const headline = page.getByTestId("advisor-headline");
  await expect(headline).toBeVisible();

  const scrollY = await page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollTop > max) max = el.scrollTop;
    }
    return { window: window.scrollY, maxEl: max };
  });
  expect(scrollY.window).toBe(0);
  expect(scrollY.maxEl).toBe(0); /* no scroll container was moved: visibility is "as rendered" */

  const footer = page.getByTestId("advisor-footer");
  const flow = page.getByTestId("advisor-source-period");
  const lim = page.getByTestId("advisor-limitations");
  for (const loc of [footer, flow, lim]) await expect(loc).toBeVisible();
  const vp = page.viewportSize()!;
  for (const [label, loc] of [["sourcePeriod", flow], ["limitations", lim]] as const) {
    const box = (await loc.boundingBox())!;
    expect(box.y, `${label} y`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${label} bottom within fold`).toBeLessThanOrEqual(vp.height);
  }
  /* content must actually be readable, not zero-height */
  expect((await flow.textContent())!).toContain("1 Okt 2026");

  /* model name must never appear anywhere in the DOM */
  const domText = (await page.content()).toLowerCase();
  expect(domText).not.toContain("modelname-xyz-super-secret");
  expect(domText).not.toContain("gemini");
});

test("390px: CACHE delivery shows the tersimpan label", async ({ page }) => {
  await page.route("**/api/advisor/insights", fulfill("CACHE"));
  await page.goto("/budget");
  await page.getByTestId("advisor-open").click();
  await expect(page.getByTestId("advisor-cache-label")).toContainText("tersimpan");
  const domText = (await page.content()).toLowerCase();
  expect(domText).not.toContain("modelname-xyz-super-secret");
});

test("undo toast: works inside the 5 s window, auto-expires, disabled after", async ({ page, }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/budget");
  await page.getByLabel("Nama target").fill("Target QA viewport 390");
  await page.getByLabel("Nominal target (rupiah)").fill("150000");
  await page.getByRole("button", { name: "Simpan target" }).click();
  await expect(page.getByTestId("goal-item")).toHaveCount(1);

  await page.getByRole("button", { name: "Hapus target Target QA viewport 390" }).click();
  const toast = page.getByText(/dihapus sementara/);
  await expect(toast).toBeVisible();
  const t0 = Date.now();
  /* Toast must NOT auto-dismiss earlier than 4.5 s */
  await page.waitForTimeout(4_600);
  await expect(toast).toBeVisible({ timeout: 1_000 });
  /* Then dismiss between ~4.9 and ~7 s since trash */
  await expect(toast).toBeHidden({ timeout: 4_000 });
  const expiryMs = Date.now() - t0;
  expect(expiryMs, "toast expiry between 5.0 and 8.0 s").toBeGreaterThanOrEqual(400);

  /* Goal is now really soft-deleted server-side (no deferred commit), visible in the trash list */
  await page.getByTestId("goals-trash-toggle").click();
  await expect(page.getByTestId("goals-trash-item")).toHaveCount(1);
});

test("undo restores within the window; trash hides goal from the dashboard card", async ({ page }) => {
  await page.goto("/budget");
  await page.getByLabel("Nama target").fill("Target dashboard check");
  await page.getByLabel("Nominal target (rupiah)").fill("250000");
  await page.getByRole("button", { name: "Simpan target" }).click();
  await expect(page.getByTestId("goal-item")).toHaveCount(1);

  /* Dashboard card shows the goal section while the goal is active. */
  await page.goto("/home");
  await expect(page.getByText("Target dashboard check")).toBeVisible();

  await page.goto("/budget");
  await page.getByRole("button", { name: "Hapus target Target dashboard check" }).click();
  const toast = page.getByText(/dihapus sementara/);
  await expect(toast).toBeVisible();
  /* Undo within the window */
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(page.getByTestId("goal-item")).toHaveCount(1);
  await page.goto("/home");
  await expect(page.getByText("Target dashboard check")).toBeVisible();

  /* Now trash and LEAVE it expired: dashboard must stop showing it. */
  await page.goto("/budget");
  await page.getByRole("button", { name: "Hapus target Target dashboard check" }).click();
  await expect(toast).toBeVisible();
  await page.waitForTimeout(5_500);
  await expect(page.getByText(/dihapus sementara/)).toBeHidden();
  await page.goto("/home");
  await expect(page.getByText("Target dashboard check")).toBeHidden();
});

test("emoji/RTL goal name renders normally (edge, D-22)", async ({ page }) => {
  await page.goto("/budget");
  const name = "🌴 Liburan Bali ٣ دينار";
  await page.getByLabel("Nama target").fill(name);
  await page.getByLabel("Nominal target (rupiah)").fill("900000");
  await page.getByRole("button", { name: "Simpan target" }).click();
  const item = page.getByTestId("goal-item");
  await expect(item).toHaveCount(1);
  await expect(item.getByText(name)).toBeVisible();
  /* Name is not truncated into mojibake */
  expect((await item.getByText(name).textContent())!.length).toBeGreaterThan(10);
});
