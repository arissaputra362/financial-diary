import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import type { DashboardDTO, DashboardPeriodKey, SpendingDayDTO } from "../types/api";
import { signUpOwner } from "./helpers";

/*
  T-014 chart display contract (design 02 §5 Card 8, design 01 §5.4).

  `GET /api/dashboard` is stubbed with a deterministic 90-day window so the
  weekly-bucket counts and tooltip strings are stable across machines and days.
  The same spec runs on the mobile (390), tablet (768), and desktop (1280)
  Playwright projects, so the overflow assertions cover all three viewports.
*/

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const END_DATE = "2026-10-23";

/** Contiguous server-shaped byDay ending at END_DATE, oldest to newest. */
function makeDays(count: number): SpendingDayDTO[] {
  const end = Date.parse(`${END_DATE}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(end - (count - 1 - index) * MS_PER_DAY).toISOString().slice(0, 10),
    /* Every day is non-zero so every bar has a visible, exact tooltip value. */
    amountMinor: (index + 1) * 1_000,
  }));
}

function dashboardPayload(period: DashboardPeriodKey): DashboardDTO {
  const count = period === "7D" ? 7 : period === "30D" ? 30 : 90;
  const byDay = makeDays(count);
  return {
    sharedBalanceMinor: 0,
    personalBalanceMinor: 0,
    currencyCode: "IDR",
    wallets: [],
    monthlyBudget: {
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      scope: "SHARED",
      isSet: false,
      budgetMinor: null,
      spentMinor: 0,
      remainingMinor: null,
      currencyCode: "IDR",
    },
    personalMonthlyBudget: {
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      scope: "PERSONAL",
      isSet: false,
      budgetMinor: null,
      spentMinor: 0,
      remainingMinor: null,
      currencyCode: "IDR",
    },
    spending: {
      periodStart: byDay[0]?.date ?? END_DATE,
      periodEnd: END_DATE,
      totalOutMinor: byDay.reduce((sum, day) => sum + day.amountMinor, 0),
      byDay,
    },
    personalSpending: {
      periodStart: byDay[0]?.date ?? END_DATE,
      periodEnd: END_DATE,
      totalOutMinor: 0,
      byDay: [],
    },
    goals: [],
    recentActivity: [],
  };
}

async function stubDashboard(page: Page): Promise<void> {
  await page.route("**/api/dashboard**", (route: Route) => {
    const url = new URL(route.request().url());
    const raw = url.searchParams.get("period");
    const period: DashboardPeriodKey = raw === "30D" || raw === "90D" ? raw : "7D";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboardPayload(period)),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page, chart = page.getByTestId("spending-chart")) {
  const metrics = await chart.evaluate((node) => {
    const card = node as HTMLElement;
    const root = document.documentElement;
    return {
      cardScrollWidth: card.scrollWidth,
      cardClientWidth: card.clientWidth,
      pageScrollWidth: root.scrollWidth,
      pageClientWidth: root.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });

  expect(
    metrics.cardScrollWidth,
    `card overflow: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.cardClientWidth);
  expect(
    metrics.pageScrollWidth,
    `page overflow: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.pageClientWidth);
  expect(
    metrics.bodyScrollWidth,
    `body overflow: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.bodyClientWidth);
}

async function expectAxisLabelsInsidePlot(chart: Locator) {
  const plot = chart.getByRole("group");
  const plotBox = await plot.boundingBox();
  expect(plotBox).not.toBeNull();

  const labelBoxes = await chart
    .getByTestId("spending-axis-label")
    .evaluateAll((nodes: Element[]) =>
      nodes.map((node: Element) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
  expect(labelBoxes.length).toBeGreaterThan(0);
  for (const box of labelBoxes) {
    expect(box.left, `axis label left: ${JSON.stringify(box)}`).toBeGreaterThanOrEqual(
      (plotBox?.x ?? 0) - 0.5,
    );
    expect(box.right, `axis label right: ${JSON.stringify(box)}`).toBeLessThanOrEqual(
      (plotBox?.x ?? 0) + (plotBox?.width ?? 0) + 0.5,
    );
  }
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page);
  await stubDashboard(page);
});

test.describe("spending chart buckets and overflow (T-014)", () => {
  test("renders 7/30 daily bars and about 13 weekly bars without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/home");
    const chart = page.getByTestId("spending-chart");
    const bars = chart.getByTestId("spending-bar");

    await expect(bars).toHaveCount(7);
    await expect(bars.first()).toHaveAttribute("data-kind", "daily");
    await expect(chart.getByTestId("spending-axis-label")).toHaveCount(7);
    await expectNoHorizontalOverflow(page, chart);
    await expectAxisLabelsInsidePlot(chart);

    await page.getByRole("tab", { name: "30D" }).click();
    await expect(bars).toHaveCount(30);
    await expect(bars.first()).toHaveAttribute("data-kind", "daily");
    await expect(chart.getByTestId("spending-axis-label")).toHaveCount(7);
    await expectNoHorizontalOverflow(page, chart);
    await expectAxisLabelsInsidePlot(chart);

    await page.getByRole("tab", { name: "90D" }).click();
    await expect(bars).toHaveCount(14);
    await expect(bars.first()).toHaveAttribute("data-kind", "weekly");
    await expect(chart.getByTestId("spending-axis-label")).toHaveCount(7);
    await expectNoHorizontalOverflow(page, chart);
    await expectAxisLabelsInsidePlot(chart);
  });

  test("keyboard navigation, focus ring, tooltip, live region, and hover", async ({ page }) => {
    await page.goto("/home");
    const chart = page.getByTestId("spending-chart");
    const bars = chart.getByTestId("spending-bar");
    const pill = chart.getByTestId("spending-tooltip");
    const live = chart.getByTestId("spending-live");

    await expect(bars).toHaveCount(7);

    /* Put focus on the active tab, then Tab through the other tabs to the chart. */
    await page.getByRole("tab", { name: "7D" }).click();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(bars.first()).toBeFocused();

    await expect(pill).toBeVisible();
    await expect(pill).toHaveText("17 Okt 2026: Rp1.000");
    await expect(live).toHaveText("17 Okt 2026: Rp1.000");

    const ring = await bars.first().getByTestId("spending-bar-fill").evaluate((node) =>
      getComputedStyle(node).boxShadow,
    );
    expect(ring, "focused bar must have a visible ring").not.toBe("none");

    await page.keyboard.press("ArrowRight");
    await expect(bars.nth(1)).toBeFocused();
    await expect(pill).toHaveText("18 Okt 2026: Rp2.000");
    await expect(live).toHaveText("18 Okt 2026: Rp2.000");

    await page.keyboard.press("Escape");
    await expect(pill).toHaveCount(0);
    await expect(live).toHaveText("");
    await expect(bars.nth(1)).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(pill).toHaveText("17 Okt 2026: Rp1.000");

    /* 90D weekly: covered range + exact bucket total, including partial weeks. */
    await page.getByRole("tab", { name: "90D" }).click();
    await expect(bars).toHaveCount(14);
    await page.keyboard.press("Tab");
    await expect(bars.first()).toBeFocused();
    await expect(pill).toHaveText("26 Jul 2026: Rp1.000");

    await page.keyboard.press("ArrowRight");
    await expect(pill).toHaveText("27 Jul sampai 2 Agu 2026: Rp35.000");

    await page.keyboard.press("End");
    await expect(bars.last()).toBeFocused();
    await expect(pill).toHaveText("19 sampai 23 Okt 2026: Rp440.000");
    await expect(live).toHaveText("19 sampai 23 Okt 2026: Rp440.000");

    const cardBox = await chart.boundingBox();
    const pillBox = await pill.boundingBox();
    const plotBox = await chart.getByRole("group").boundingBox();
    expect(cardBox).not.toBeNull();
    expect(pillBox).not.toBeNull();
    expect(plotBox).not.toBeNull();
    /* The pill floats above the plot, inside the card. */
    expect((pillBox?.y ?? 0) + (pillBox?.height ?? 0)).toBeLessThanOrEqual(
      (plotBox?.y ?? 0) + 0.5,
    );
    expect(pillBox?.x ?? 0).toBeGreaterThanOrEqual(cardBox?.x ?? 0);
    expect((pillBox?.x ?? 0) + (pillBox?.width ?? 0)).toBeLessThanOrEqual(
      (cardBox?.x ?? 0) + (cardBox?.width ?? 0) + 0.5,
    );
    expect(pillBox?.y ?? 0).toBeGreaterThanOrEqual(cardBox?.y ?? 0);
    expect((pillBox?.y ?? 0) + (pillBox?.height ?? 0)).toBeLessThanOrEqual(
      (cardBox?.y ?? 0) + (cardBox?.height ?? 0) + 0.5,
    );
    await expectNoHorizontalOverflow(page, chart);

    /* Pointer hover shows the same pill on the hovered bucket. */
    await bars.nth(2).hover();
    await expect(pill).toHaveText("3 sampai 9 Agu 2026: Rp84.000");
    await expectNoHorizontalOverflow(page, chart);
  });
});
