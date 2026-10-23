import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import type {
  DashboardDTO,
  DashboardPeriodKey,
  MonthlyBudgetDTO,
  SpendingDayDTO,
} from "../types/api";
import { signUpMember, signUpOwner } from "./helpers";

/*
  T-015 personal budget and scope E2E (AC-F2-2c, AC-F2-5b).

  Control behavior and unset states use a deterministic dashboard payload so the
  two independent scope pills can be compared without relying on fixture money.
  Create/edit persistence and the member permission split run against the real
  API so the session-scoped personal budget is exercised end to end.
*/

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const END_DATE = "2026-10-23";

function makeDays(count: number, perDay: number): SpendingDayDTO[] {
  const end = Date.parse(`${END_DATE}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(end - (count - 1 - index) * MS_PER_DAY).toISOString().slice(0, 10),
    amountMinor: perDay,
  }));
}

function makeBudget(
  scope: "SHARED" | "PERSONAL",
  amountMinor: number | null,
  spentMinor: number,
): MonthlyBudgetDTO {
  return {
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    scope,
    isSet: amountMinor !== null,
    budgetMinor: amountMinor,
    spentMinor,
    remainingMinor: amountMinor === null ? null : amountMinor - spentMinor,
    currencyCode: "IDR",
  };
}

function dashboardPayload(
  period: DashboardPeriodKey,
  options: { unset?: boolean } = {},
): DashboardDTO {
  const count = period === "7D" ? 7 : period === "30D" ? 30 : 90;
  const sharedByDay = options.unset ? [] : makeDays(count, 1_000);
  const personalByDay = options.unset ? [] : makeDays(count, 250);
  const total = (days: SpendingDayDTO[]) =>
    days.reduce((sum, day) => sum + day.amountMinor, 0);

  return {
    sharedBalanceMinor: 0,
    personalBalanceMinor: 0,
    currencyCode: "IDR",
    wallets: [],
    monthlyBudget: options.unset
      ? makeBudget("SHARED", null, 0)
      : makeBudget("SHARED", 3_000_000, 1_000_000),
    personalMonthlyBudget: options.unset
      ? makeBudget("PERSONAL", null, 0)
      : makeBudget("PERSONAL", 1_000_000, 250_000),
    spending: {
      periodStart: sharedByDay[0]?.date ?? END_DATE,
      periodEnd: END_DATE,
      totalOutMinor: total(sharedByDay),
      byDay: sharedByDay,
    },
    personalSpending: {
      periodStart: personalByDay[0]?.date ?? END_DATE,
      periodEnd: END_DATE,
      totalOutMinor: total(personalByDay),
      byDay: personalByDay,
    },
    goals: [],
    recentActivity: [],
  };
}

async function stubDashboard(
  page: Page,
  options: { unset?: boolean } = {},
): Promise<void> {
  await page.route("**/api/dashboard**", (route: Route) => {
    const url = new URL(route.request().url());
    const raw = url.searchParams.get("period");
    const period: DashboardPeriodKey = raw === "30D" || raw === "90D" ? raw : "7D";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboardPayload(period, options)),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page, card?: Locator): Promise<void> {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      pageScrollWidth: root.scrollWidth,
      pageClientWidth: root.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
  expect(metrics.pageScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    metrics.pageClientWidth,
  );
  expect(metrics.bodyScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    metrics.bodyClientWidth,
  );

  if (card) {
    const cardMetrics = await card.evaluate((node) => {
      const element = node as HTMLElement;
      return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(cardMetrics.scrollWidth, JSON.stringify(cardMetrics)).toBeLessThanOrEqual(
      cardMetrics.clientWidth,
    );
  }
}

async function expectTouchTargets(group: Locator): Promise<void> {
  const tabs = group.getByRole("tab");
  await expect(tabs).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const box = await tabs.nth(index).boundingBox();
    expect(box, `tab ${index} has no box`).not.toBeNull();
    expect(box!.width, `tab ${index} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `tab ${index} height`).toBeGreaterThanOrEqual(44);
  }
}

test.describe("dashboard budget and chart scope controls (AC-F2-2c, AC-F2-5b)", () => {
  test("defaults to Bersama, stays independent, and keeps the 90D weekly buckets", async ({
    page,
  }) => {
    await signUpOwner(page);
    await stubDashboard(page);
    await page.goto("/home");

    const budgetCard = page.locator("section", {
      has: page.getByRole("heading", { name: "Budget bulan ini" }),
    });
    const chart = page.getByTestId("spending-chart");
    const budgetMode = page.getByRole("tablist", { name: "Mode budget" });
    const chartScope = page.getByRole("tablist", { name: "Lingkup grafik" });
    const periodTabs = page.getByRole("tablist", { name: "Periode grafik" });

    /* First paint is the existing household view on both surfaces. */
    await expect(budgetMode.getByRole("tab", { name: "Bersama" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(chartScope.getByRole("tab", { name: "Bersama" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(budgetCard.getByText("Dihitung dari dompet keluarga saja.")).toBeVisible();
    await expect(budgetCard.getByText("Rp2.000.000")).toBeVisible();
    await expect(chart.getByText("Rp7.000 keluar pada periode ini.")).toBeVisible();

    /* The selected pill is the Tab stop; arrows move selection with a focus ring. */
    await budgetMode.getByRole("tab", { name: "Bersama" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(budgetMode.getByRole("tab", { name: "Pribadi" })).toBeFocused();
    await expect(budgetMode.getByRole("tab", { name: "Pribadi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const focusRing = await budgetMode
      .getByRole("tab", { name: "Pribadi" })
      .evaluate((node) => getComputedStyle(node).boxShadow);
    expect(focusRing, "scope tab must show a visible focus ring").not.toBe("none");
    await page.keyboard.press("ArrowRight");
    await expect(budgetMode.getByRole("tab", { name: "Bersama" })).toBeFocused();
    await expect(budgetMode.getByRole("tab", { name: "Bersama" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    /* Budget card switch does not move the chart scope. */
    await budgetMode.getByRole("tab", { name: "Pribadi" }).click();
    await expect(budgetCard.getByText("Dihitung dari dompet pribadimu.")).toBeVisible();
    await expect(budgetCard.getByText("Rp750.000")).toBeVisible();
    await expect(chartScope.getByRole("tab", { name: "Bersama" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(chart.getByText("Rp7.000 keluar pada periode ini.")).toBeVisible();

    /* Chart switch does not move the budget card mode. */
    await chartScope.getByRole("tab", { name: "Pribadi" }).click();
    await expect(
      chart.getByText("Rp1.750 keluar dari dompet pribadimu pada periode ini."),
    ).toBeVisible();
    await expect(budgetMode.getByRole("tab", { name: "Pribadi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(budgetCard.getByText("Dihitung dari dompet pribadimu.")).toBeVisible();

    /* A period change keeps the chart scope and still groups 90D weekly. */
    await periodTabs.getByRole("tab", { name: "90D" }).click();
    await expect(chartScope.getByRole("tab", { name: "Pribadi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      chart.getByText("Rp22.500 keluar dari dompet pribadimu pada periode ini."),
    ).toBeVisible();
    await expect(chart.getByTestId("spending-bar")).toHaveCount(14);
    await expect(chart.getByTestId("spending-bar").first()).toHaveAttribute(
      "data-kind",
      "weekly",
    );

    /* Controls own a row on mobile and share the header row only on desktop. */
    const width = page.viewportSize()?.width ?? 0;
    const scopeBox = await chartScope.boundingBox();
    const periodBox = await periodTabs.boundingBox();
    expect(scopeBox).not.toBeNull();
    expect(periodBox).not.toBeNull();
    if (width < 1024) {
      expect(scopeBox!.y, "scope row must sit above the period row").toBeLessThan(
        periodBox!.y,
      );
    } else {
      expect(Math.abs(scopeBox!.y - periodBox!.y)).toBeLessThan(12);
      expect(scopeBox!.x).toBeLessThan(periodBox!.x);
    }

    await expectTouchTargets(budgetMode);
    await expectTouchTargets(chartScope);
    await expectNoHorizontalOverflow(page, budgetCard);
    await expectNoHorizontalOverflow(page, chart);
  });

  test("shows per-mode unset states instead of Rp0", async ({ page }) => {
    await signUpOwner(page);
    await stubDashboard(page, { unset: true });
    await page.goto("/home");

    const budgetCard = page.locator("section", {
      has: page.getByRole("heading", { name: "Budget bulan ini" }),
    });
    const chart = page.getByTestId("spending-chart");
    const budgetMode = page.getByRole("tablist", { name: "Mode budget" });
    const chartScope = page.getByRole("tablist", { name: "Lingkup grafik" });

    await expect(budgetCard.getByText("Belum ada budget bulan ini")).toBeVisible();
    await expect(budgetCard.getByRole("link", { name: "Atur budget" })).toHaveAttribute(
      "href",
      "/budget",
    );
    await expect(chart.getByText("Belum ada pengeluaran pada periode ini.")).toBeVisible();

    await budgetMode.getByRole("tab", { name: "Pribadi" }).click();
    await expect(budgetCard.getByText("Belum ada budget pribadi bulan ini")).toBeVisible();
    await expect(budgetCard.getByRole("link", { name: "Atur budget" })).toHaveAttribute(
      "href",
      "/budget?scope=personal",
    );
    await expect(budgetCard.getByText("Dihitung dari dompet pribadimu.")).toBeVisible();

    await chartScope.getByRole("tab", { name: "Pribadi" }).click();
    await expect(
      chart.getByText("Belum ada pengeluaran dari dompet pribadimu pada periode ini."),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("NaN");
  });
});

test.describe("budget page personal mode (AC-F2-2c)", () => {
  test("owner creates and edits a personal budget and both caps persist after reload", async ({
    page,
  }) => {
    await signUpOwner(page);

    await page.goto("/budget?scope=personal");
    const mode = page.getByRole("tablist", { name: "Mode budget" });
    await expect(mode.getByRole("tab", { name: "Pribadi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("Belum ada budget pribadi bulan ini")).toBeVisible();

    await page.getByLabel("Budget pribadi bulan ini (rupiah)").fill("750000");
    await page.getByRole("button", { name: "Simpan budget" }).click();
    await expect(page.getByText("Budget pribadi tersimpan.")).toBeVisible();
    await expect(page.getByText("Rp750.000").first()).toBeVisible();

    await page.reload();
    await expect(mode.getByRole("tab", { name: "Pribadi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByLabel("Budget pribadi bulan ini (rupiah)")).toHaveValue(
      "750.000",
    );

    /* Edit the same cap, not a new one. */
    await page.getByLabel("Budget pribadi bulan ini (rupiah)").fill("800000");
    await page.getByRole("button", { name: "Simpan budget" }).click();
    await expect(page.getByText("Budget pribadi tersimpan.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Budget pribadi bulan ini (rupiah)")).toHaveValue(
      "800.000",
    );

    /* The household cap is still its own value. */
    await mode.getByRole("tab", { name: "Bersama" }).click();
    await expect(page.getByText("Belum ada budget bulan ini")).toBeVisible();
    await page.getByLabel("Budget bulan ini (rupiah)").fill("3000000");
    await page.getByRole("button", { name: "Simpan budget" }).click();
    await expect(page.getByText("Budget bulan ini tersimpan.")).toBeVisible();

    await page.goto("/budget");
    await expect(page.getByLabel("Budget bulan ini (rupiah)")).toHaveValue("3.000.000");
    await page.getByRole("tablist", { name: "Mode budget" })
      .getByRole("tab", { name: "Pribadi" })
      .click();
    await expect(page.getByLabel("Budget pribadi bulan ini (rupiah)")).toHaveValue(
      "800.000",
    );
    await expect(page.locator("body")).not.toContainText("3.800.000");

    /* The dashboard card reads each cap independently, never the sum. */
    await page.goto("/home");
    const budgetCard = page.locator("section", {
      has: page.getByRole("heading", { name: "Budget bulan ini" }),
    });
    await expect(budgetCard.getByText("Dihitung dari dompet keluarga saja.")).toBeVisible();
    await expect(budgetCard.getByText("Rp3.000.000").first()).toBeVisible();
    await page.getByRole("tablist", { name: "Mode budget" })
      .getByRole("tab", { name: "Pribadi" })
      .click();
    await expect(budgetCard.getByText("Dihitung dari dompet pribadimu.")).toBeVisible();
    await expect(budgetCard.getByText("Rp800.000").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("3.800.000");
  });

  test("member can edit their personal cap while the shared cap stays read-only", async ({
    page,
    browser,
  }) => {
    await signUpOwner(page);

    /* Owner sets the household cap through the existing shared form. */
    await page.goto("/budget");
    await page.getByLabel("Budget bulan ini (rupiah)").fill("3000000");
    await page.getByRole("button", { name: "Simpan budget" }).click();
    await expect(page.getByText("Budget bulan ini tersimpan.")).toBeVisible();

    const baseURL = test.info().project.use.baseURL;
    expect(baseURL).toBeTruthy();
    const member = await signUpMember(browser, page, baseURL!);

    try {
      await member.page.goto("/budget");
      const memberMode = member.page.getByRole("tablist", { name: "Mode budget" });
      await expect(memberMode.getByRole("tab", { name: "Bersama" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(
        member.page.getByText("Hanya pemilik keluarga yang dapat mengubah budget."),
      ).toBeVisible();
      await expect(member.page.getByLabel("Budget bulan ini (rupiah)")).toHaveCount(0);

      await memberMode.getByRole("tab", { name: "Pribadi" }).click();
      const personalInput = member.page.getByLabel("Budget pribadi bulan ini (rupiah)");
      await expect(personalInput).toBeVisible();
      await personalInput.fill("400000");
      await member.page.getByRole("button", { name: "Simpan budget" }).click();
      await expect(member.page.getByText("Budget pribadi tersimpan.")).toBeVisible();

      await member.page.goto("/budget?scope=personal");
      await expect(personalInput).toHaveValue("400.000");

      await member.page.getByRole("tablist", { name: "Mode budget" })
        .getByRole("tab", { name: "Bersama" })
        .click();
      await expect(member.page.getByLabel("Budget bulan ini (rupiah)")).toHaveCount(0);

      /* The owner's personal view is the owner's own (unset) cap, not the member's. */
      await page.goto("/budget?scope=personal");
      await expect(
        page
          .getByRole("tablist", { name: "Mode budget" })
          .getByRole("tab", { name: "Pribadi" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("Belum ada budget pribadi bulan ini")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Rp400.000");
    } finally {
      await member.context.close();
    }
  });
});
