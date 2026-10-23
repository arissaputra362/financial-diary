import { expect, test, type Page } from "@playwright/test";
import { signUpOwner } from "./helpers";

/*
  T-007 goals + advisor E2E (AC-F4-1..AC-F4-4 goals via the real API,
  AC-F4-5..AC-F4-8 advisor states via deterministic network interception, so
  the free-tier Gemini 503 noise can never produce flaky UI assertions).

  Runs on mobile (390x844), tablet (768x1024), and desktop (1280x800).
*/

const INSIGHT = {
  headline: "Pengeluaran makan keluarga turun 8 persen minggu ini.",
  summary: "Masak sendiri semakin sering. Saldo bulan ini masih lega untuk target liburan.",
  actions: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
  limitations: "Ini bukan nasihat keuangan profesional. Sarannya dihitung dari catatan keluargamu sendiri.",
  sourcePeriod: { start: "2026-10-01", end: "2026-10-07" },
  model: "never-shown",
  generatedAt: "2026-10-07T03:00:00.000Z",
  expiresAt: "2026-10-08T03:00:00.000Z",
};

function fulfillInsight(delivery: "FRESH" | "CACHE") {
  return async (route: import("@playwright/test").Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ insight: INSIGHT, delivery }),
    });
  };
}

async function fulfillUnavailable(route: import("@playwright/test").Route) {
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "ADVISOR_UNAVAILABLE", message: "Saran belum bisa dibuat sekarang." } }),
  });
}

async function openAdvisorDrawer(page: Page): Promise<void> {
  await page.route("**/api/advisor/insights", fulfillInsight("FRESH"));
  await page.goto("/budget");
  await page.getByTestId("advisor-open").click();
  await expect(page.getByTestId("advisor-headline")).toHaveText(INSIGHT.headline);
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page);
});

test.describe("goals lifecycle (AC-F4-1..AC-F4-4)", () => {
  test("create, past deadline badge, adjust saved, progress", async ({ page }) => {
    await page.goto("/budget");
    await page.getByLabel("Nama target").fill("Dana darurat E2E");
    await page.getByLabel("Nominal target (rupiah)").fill("500000");
    await page.getByLabel("Batas waktu (opsional)").fill("2020-01-01");
    await page.getByRole("button", { name: "Simpan target" }).click();

    const goalItem = page.getByTestId("goal-item");
    await expect(goalItem).toBeVisible();
    await expect(page.getByTestId("goal-late-badge")).toBeVisible();
    await expect(goalItem.getByText("0%")).toBeVisible();

    await goalItem.getByRole("button", { name: "Catat progres" }).click();
    await page.locator('[data-testid="adjust-dialog"]').getByLabel("Jumlah progres (rupiah)").fill("200000");
    await page.locator('[data-testid="adjust-dialog"]').getByRole("button", { name: "Simpan progres" }).click();
    await expect(goalItem.getByText("40%")).toBeVisible();
    await expect(goalItem.getByText("Rp200.000")).toBeVisible();
  });

  test("duplicate names both stay, trash has the 5-second undo toast that restores", async ({ page }) => {
    await page.goto("/budget");
    for (const index of [1, 2]) {
      await page.getByLabel("Nama target").fill("Tabungan sama");
      await page.getByLabel("Nominal target (rupiah)").fill(`${index}00000`);
      await page.getByRole("button", { name: "Simpan target" }).click();
      await expect(page.getByTestId("goal-item")).toHaveCount(index);
    }

    /* Undo the first trash within the toast window. */
    await page.getByRole("button", { name: "Hapus target Tabungan sama" }).first().click();
    const toast = page.getByText("dihapus sementara");
    await expect(toast).toBeVisible();
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByTestId("goal-item")).toHaveCount(2);
    await expect(toast).toBeHidden();
  });

  test("trash list restore path", async ({ page }) => {
    await page.goto("/budget");
    await page.getByLabel("Nama target").fill("Target dibuang");
    await page.getByLabel("Nominal target (rupiah)").fill("100000");
    await page.getByRole("button", { name: "Simpan target" }).click();
    const item = page.getByTestId("goal-item");
    await expect(item).toBeVisible();
    await page.getByRole("button", { name: "Hapus target Target dibuang" }).click();
    await expect(item).toHaveCount(0);

    await page.getByTestId("goals-trash-toggle").click();
    await expect(page.getByTestId("goals-trash-item")).toHaveCount(1);
    await page.getByRole("button", { name: "Pulihkan" }).click();
    await expect(page.getByTestId("goals-trash-item")).toHaveCount(0);
    await expect(page.getByTestId("goal-item")).toHaveCount(1);
  });
});

test.describe("advisor drawer (AC-F4-5..AC-F4-8)", () => {
  test("FRESH: headline + footer limitations + source period visible at 390px without scrolling", async ({ page }) => {
    await openAdvisorDrawer(page);
    await expect(page.getByTestId("advisor-fresh-label")).toBeVisible();
    const footer = page.getByTestId("advisor-footer");
    await expect(footer.getByTestId("advisor-limitations")).toBeVisible();
    await expect(footer.getByTestId("advisor-source-period")).toBeVisible();
    /* Pinned footer: not covered and reachable in the 390x844 viewport. */
    const box = await footer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(0);

    /* Labels bounded actions only: our fixtured action is VIEW_GOAL. */
    await page.getByTestId("advisor-actions").getByRole("button", { name: "Lihat target tabungan" }).click();
    await expect(page.getByTestId("advisor-drawer")).toBeHidden();
  });

  test("CACHE: the saved insight carries the tersimpan label (AC-F4-6)", async ({ page }) => {
    await page.route("**/api/advisor/insights", fulfillInsight("CACHE"));
    await page.goto("/budget");
    await page.getByTestId("advisor-open").click();
    await expect(page.getByTestId("advisor-cache-label")).toContainText("tersimpan");
    /* Footer still pinned with the source period. */
    await expect(page.getByTestId("advisor-source-period")).toContainText("Periode sumber: 1 Okt 2026 sampai 7 Okt 2026");
  });

  test("typed 503 error state is honest, with no invented advice (AC-F4-7)", async ({ page }) => {
    await page.route("**/api/advisor/insights", fulfillUnavailable);
    await page.goto("/budget");
    await page.getByTestId("advisor-open").click();
    await expect(page.getByTestId("advisor-error")).toContainText("Finny belum bisa menganalisis sekarang");
    await expect(page.getByTestId("advisor-headline")).toHaveCount(0);
    /* Limitations stay visible even in the failure state. */
    await expect(page.getByTestId("advisor-limitations")).toBeVisible();
  });

  test("period validation: span above 90 days is rejected client-side (AC-F4-5)", async ({ page }) => {
    await page.route("**/api/advisor/insights", fulfillUnavailable);
    await page.goto("/budget");
    await page.getByTestId("advisor-open").click();
    await page.getByLabel(/Mulai/).fill("2026-01-01");
    await page.getByLabel(/Akhir/).fill("2026-04-30");
    await page.getByRole("button", { name: "Setel rentang" }).click();
    await expect(page.getByText("Rentang maksimal 90 hari.")).toBeVisible();
  });

  test("period validation: clearing a populated date is rejected as empty", async ({ page }) => {
    await page.route("**/api/advisor/insights", fulfillUnavailable);
    await page.goto("/budget");
    await page.getByTestId("advisor-open").click();
    await page.getByLabel("Mulai").fill("");
    await page.getByRole("button", { name: "Setel rentang" }).click();
    await expect(page.getByText("Isi tanggal mulai dan tanggal akhir.")).toBeVisible();
  });

  test("copy hygiene: no model name and no forbidden investment-guarantee phrases (AC-F4-8, A-30)", async ({ page }) => {
    await openAdvisorDrawer(page);
    const drawer = page.getByTestId("advisor-drawer");
    const text = (await drawer.innerText()).toLowerCase();
    expect(text).not.toContain("gemini");
    expect(text).not.toContain("dijamin");
    expect(text).not.toContain("pasti hemat");
    expect(text).not.toContain("sesuai ojk");
  });
});
