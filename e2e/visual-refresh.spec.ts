import { expect, test, type Route } from "@playwright/test";
import { createWallet, signUpOwner, todayJakarta } from "./helpers";

/*
  T-010 visual acceptance checks (AC-VIS-3..AC-VIS-7). These assert rendered
  behavior only: R-9 order, two separate wallet totals, cursor pagination, the
  generic ATM card boundary, long-money clipping, and touch targets. No sample
  label or amount from the design evidence is treated as product data.

  The suite runs at 390x844, 768x1024, and 1280x800 through the Playwright
  projects, so each responsive assertion is repeated per breakpoint.
*/

const WALLET_ID = "33333333-3333-4333-8333-333333333333";
const LONG_MONEY = 9_007_199_254_740_991;

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const LONG_MONEY_DASHBOARD = {
  sharedBalanceMinor: LONG_MONEY,
  personalBalanceMinor: LONG_MONEY,
  currencyCode: "IDR",
  wallets: [
    {
      id: WALLET_ID,
      name: "Dompet nilai panjang",
      purpose: null,
      scope: "SHARING",
      balanceMinor: LONG_MONEY,
      archivedAt: null,
      canEdit: true,
      canArchive: true,
      canRestore: false,
    },
  ],
  monthlyBudget: {
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    scope: "SHARED",
    isSet: true,
    budgetMinor: LONG_MONEY,
    spentMinor: LONG_MONEY,
    remainingMinor: LONG_MONEY,
    currencyCode: "IDR",
  },
  personalMonthlyBudget: {
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    scope: "PERSONAL",
    isSet: true,
    budgetMinor: LONG_MONEY,
    spentMinor: LONG_MONEY,
    remainingMinor: LONG_MONEY,
    currencyCode: "IDR",
  },
  spending: {
    periodStart: "2026-10-01",
    periodEnd: todayJakarta(),
    totalOutMinor: LONG_MONEY,
    byDay: [{ date: todayJakarta(), amountMinor: LONG_MONEY }],
  },
  personalSpending: {
    periodStart: "2026-10-01",
    periodEnd: todayJakarta(),
    totalOutMinor: LONG_MONEY,
    byDay: [{ date: todayJakarta(), amountMinor: LONG_MONEY }],
  },
  goals: [],
  recentActivity: [],
};

function transactionRow(id: string, merchant: string) {
  const now = new Date().toISOString();
  return {
    id,
    type: "MONEY_OUT",
    amountMinor: 150_000,
    currencyCode: "IDR",
    category: "food",
    merchant,
    note: null,
    occurredAt: now,
    source: "MANUAL",
    receiptId: null,
    transferGroupId: null,
    wallet: { id: WALLET_ID, name: "Dompet E2E", scope: "SHARING" },
    deletedAt: null,
    createdAt: now,
  };
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page);
});

test.describe("home R-9 composition (AC-VIS-4, AC-VIS-5)", () => {
  test("orders the sections, keeps exactly two wallet totals, and hides bank/card identifiers", async ({ page }) => {
    const shared = await createWallet(page, {
      name: "Dompet bersama E2E",
      scope: "SHARING",
      openingBalanceMinor: 1_500_000,
    });
    const personal = await createWallet(page, {
      name: "Dompet pribadi E2E",
      scope: "PERSONAL",
      openingBalanceMinor: 2_500_000,
    });

    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Pengeluaran bulan ini" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("NaN");

    const walletRegion = page.getByRole("region", { name: "Dompet" });
    await expect(walletRegion).toBeVisible();
    /* Exactly two separate summaries; Pribadi is never folded into Bersama. */
    await expect(walletRegion.locator("article")).toHaveCount(2);
    const sharedSummary = walletRegion.locator("article").filter({ hasText: "Uang tersedia bersama" });
    const personalSummary = walletRegion.locator("article").filter({ hasText: "Dompet pribadiku" });
    await expect(sharedSummary).toContainText("Rp1.500.000");
    await expect(personalSummary).toContainText("Rp2.500.000");
    await expect(page.getByText("Rp4.000.000")).toHaveCount(0);

    const boxOf = async (locator: ReturnType<typeof page.locator>) => {
      const box = await locator.first().boundingBox();
      expect(box).not.toBeNull();
      return box!;
    };
    const heroBox = await boxOf(page.getByRole("heading", { name: "Pengeluaran bulan ini" }));
    const sharedBox = await boxOf(page.getByText("Uang tersedia bersama"));
    const personalBox = await boxOf(page.getByText("Dompet pribadiku"));
    const activityBox = await boxOf(page.getByRole("heading", { name: "Aktivitas terbaru" }));
    const budgetBox = await boxOf(page.getByRole("heading", { name: "Budget bulan ini" }));
    const chartBox = await boxOf(page.getByRole("heading", { name: "Rincian pengeluaran" }));
    const goalsBox = await boxOf(page.getByRole("heading", { name: "Target tabungan" }));
    const heroY = heroBox.y;
    const sharedY = sharedBox.y;
    const personalY = personalBox.y;
    const activityY = activityBox.y;
    const budgetY = budgetBox.y;
    const chartY = chartBox.y;
    const goalsY = goalsBox.y;

    expect(sharedY).toBeGreaterThan(heroY);
    /*
      Bersama and Pribadi are separate cards in one row; DOM order is left to
      right. If a card stacks (long money), the vertical order still holds.
    */
    expect(personalY).toBeGreaterThanOrEqual(sharedY);
    if (personalY === sharedY) expect(personalBox.x).toBeGreaterThan(sharedBox.x);
    expect(activityY).toBeGreaterThan(Math.max(sharedY, personalY));
    expect(budgetY).toBeGreaterThan(activityY);
    expect(chartY).toBeGreaterThan(activityY);
    expect(goalsY).toBeGreaterThan(Math.max(budgetY, chartY));

    /* Generic ATM treatment: name/scope/balance only, never card or bank data. */
    const sharedCard = page.getByRole("button", {
      name: `${shared.name}, Bersama, tersedia Rp1.500.000, buka detail`,
    });
    await expect(sharedCard).toBeVisible();
    const cardText = await sharedCard.innerText();
    expect(cardText).not.toMatch(/\b(?:\d[ -]?){12,19}\b/);
    expect(cardText.toLowerCase()).not.toMatch(
      /cvv|expiry|berlaku hingga|visa|mastercard|\bbca\b|\bmandiri\b|\bbri\b|\bbni\b/,
    );

    const personalCard = page.getByRole("button", {
      name: `${personal.name}, Pribadi, tersedia Rp2.500.000, buka detail`,
    });
    await expect(personalCard).toBeVisible();
  });
});

test.describe("long money rendering (AC-VIS-7)", () => {
  test("keeps the aggregate value intact and unclipped at this viewport", async ({ page }) => {
    await page.route("**/api/dashboard**", (route) => fulfillJson(route, LONG_MONEY_DASHBOARD));
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Pengeluaran bulan ini" })).toBeVisible();
    await expect(page.getByText("Rp9.007.199.254.740.991").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("NaN");

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow, "document must not scroll horizontally").toBeLessThanOrEqual(0);

    /* No money element may clip its own text. */
    const clippedMoney = await page.locator(".tabular-nums").evaluateAll((nodes) =>
      nodes
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => node.textContent?.trim() ?? ""),
    );
    expect(clippedMoney).toEqual([]);
  });
});

test.describe("activity cursor pagination (AC-VIS-6)", () => {
  test("renders one Muat lebih banyak CTA and appends the next cursor page", async ({ page }) => {
    await page.route(/\/api\/transactions\?/, async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      if (cursor) {
        await fulfillJson(route, {
          rows: [transactionRow("44444444-4444-4444-8444-444444444444", "Halaman dua E2E")],
          nextCursor: null,
        });
        return;
      }
      await fulfillJson(route, {
        rows: [transactionRow("55555555-5555-4555-8555-555555555555", "Halaman satu E2E")],
        nextCursor: "cursor-page-2",
      });
    });

    await page.goto("/transactions");
    await expect(page.getByText("Halaman satu E2E")).toBeVisible();

    const loadMore = page.getByRole("button", { name: "Muat lebih banyak" });
    await expect(loadMore).toHaveCount(1);
    await loadMore.click();

    await expect(page.getByText("Halaman dua E2E")).toBeVisible();
    await expect(page.getByText("Halaman satu E2E")).toBeVisible();
    await expect(loadMore).toHaveCount(0);
    /* No page-number navigation may appear in place of the cursor contract. */
    await expect(page.getByRole("button", { name: /Sebelumnya|Berikutnya/ })).toHaveCount(0);
    await expect(page.getByText("Halaman 1")).toHaveCount(0);
  });
});

test.describe("login touch targets (AC-VIS-8)", () => {
  test("mode tabs and password visibility toggle are at least 44x44", async ({ page }) => {
    await page.goto("/login");
    const modeGroup = page.getByRole("group", { name: "Pilih mode akun" });

    for (const name of ["Masuk", "Buat akun"]) {
      const box = await modeGroup.getByRole("button", { name, exact: true }).boundingBox();
      expect(box, `${name} touch target missing`).not.toBeNull();
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }

    const toggle = page.getByRole("button", { name: "Tampilkan kata sandi" });
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox, "password toggle touch target missing").not.toBeNull();
    expect(toggleBox!.width, "password toggle width").toBeGreaterThanOrEqual(44);
    expect(toggleBox!.height, "password toggle height").toBeGreaterThanOrEqual(44);
  });
});
