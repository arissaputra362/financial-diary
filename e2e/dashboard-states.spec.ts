import { expect, test, type Route } from "@playwright/test";
import { devFixtureEmail, signUpOwner } from "./helpers";

/*
  AC-F2-8 dashboard state oracle. The dashboard is one client-side
  `GET /api/dashboard` call, so the four spec states are driven by stubbing that
  route: loading skeleton, true empty state, full error + retry (no partial
  cards), and the filtered-empty activity list. Assertions target rendered
  behavior, not test or source names.

  Stubs use the current T-009 wallet DTO (`sharedBalanceMinor`,
  `personalBalanceMinor`, `wallets`); a stale pre-wallet payload is used only to
  prove the dashboard fails honestly instead of rendering `RpNaN`.

  Stubbing is retry-safe: React Strict Mode double-invokes the mount effect in
  dev, so the error route stays failing until the test explicitly recovers.
*/

const WALLET_ID = "22222222-2222-4222-8222-222222222222";

const EMPTY_DASHBOARD = {
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
  spending: { periodStart: "2026-09-30", periodEnd: "2026-10-06", totalOutMinor: 0, byDay: [] },
  personalSpending: { periodStart: "2026-09-30", periodEnd: "2026-10-06", totalOutMinor: 0, byDay: [] },
  goals: [],
  recentActivity: [],
};

/** A pre-wallet response shape: valid JSON, missing the current wallet fields. */
const STALE_DASHBOARD = {
  balanceMinor: 0,
  currencyCode: "IDR",
  monthlyBudget: EMPTY_DASHBOARD.monthlyBudget,
  spending: EMPTY_DASHBOARD.spending,
  goals: [],
  recentActivity: [],
};

const ONE_ROW_DASHBOARD = {
  ...EMPTY_DASHBOARD,
  sharedBalanceMinor: 150_000,
  wallets: [
    {
      id: WALLET_ID,
      name: "Dompet state E2E",
      purpose: null,
      scope: "SHARING",
      balanceMinor: 150_000,
      archivedAt: null,
      canEdit: true,
      canArchive: true,
      canRestore: false,
    },
  ],
  recentActivity: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      type: "MONEY_OUT",
      amountMinor: 150_000,
      currencyCode: "IDR",
      category: "food",
      merchant: "Belanja state E2E",
      note: null,
      occurredAt: "2026-10-06T05:00:00.000Z",
      source: "MANUAL",
      receiptId: null,
      transferGroupId: null,
      wallet: { id: WALLET_ID, name: "Dompet state E2E", scope: "SHARING" },
      deletedAt: null,
      createdAt: "2026-10-06T05:00:00.000Z",
    },
  ],
};

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page, devFixtureEmail());
});

test.describe("dashboard loading skeleton (AC-F2-8)", () => {
  test("shows the loading skeleton before the aggregation resolves", async ({ page }) => {
    await page.route("**/api/dashboard**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await fulfillJson(route, EMPTY_DASHBOARD);
    });

    await page.goto("/home");
    await expect(page.locator('[aria-label="Memuat ringkasan"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pengeluaran bulan ini" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[aria-label="Memuat ringkasan"]')).toHaveCount(0);
  });
});

test.describe("dashboard empty state (AC-F2-8)", () => {
  test("shows plain-language empty guidance on every card", async ({ page }) => {
    await page.route("**/api/dashboard**", (route) => fulfillJson(route, EMPTY_DASHBOARD));

    await page.goto("/home");
    await expect(page.getByText("Belum ada pengeluaran bulan ini")).toBeVisible();
    await expect(page.getByText("Uang tersedia bersama")).toBeVisible();
    await expect(page.getByText("Dompet pribadiku")).toBeVisible();
    await expect(page.getByText("Belum ada dompet.")).toBeVisible();
    await expect(page.getByText("Belum ada budget bulan ini")).toBeVisible();
    await expect(page.getByText("Belum ada target tabungan")).toBeVisible();
    await expect(page.getByText("Belum ada aktivitas")).toBeVisible();
    await expect(page.getByText("Belum ada pengeluaran pada periode ini.")).toBeVisible();
    /* Empty cards point at the first real action, never a dead end. */
    await expect(page.getByRole("link", { name: "Atur budget" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Buat dompet pertama" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("NaN");
  });
});

test.describe("dashboard error state (AC-F2-8)", () => {
  test("shows one full error state with retry and no partial cards, then recovers", async ({ page }) => {
    let phase: "error" | "stale" | "ok" = "error";
    await page.route("**/api/dashboard**", async (route) => {
      if (phase === "stale") await new Promise((resolve) => setTimeout(resolve, 250));
      if (phase === "ok") await new Promise((resolve) => setTimeout(resolve, 250));
      if (phase === "error") {
        await fulfillJson(route, { error: { code: "INTERNAL", message: "boom" } }, 500);
      } else if (phase === "stale") {
        await fulfillJson(route, STALE_DASHBOARD);
      } else {
        await fulfillJson(route, EMPTY_DASHBOARD);
      }
    });

    await page.goto("/home");
    await expect(page.getByText("Ringkasan keuangan belum bisa dimuat.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
    /* No partial cards while the aggregation failed. */
    await expect(page.getByRole("heading", { name: "Pengeluaran bulan ini" })).toHaveCount(0);
    await expect(page.getByText("Uang tersedia bersama")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Budget bulan ini" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Aktivitas terbaru" })).toHaveCount(0);
    await expect(page.locator('[aria-label="Memuat ringkasan"]')).toHaveCount(0);

    /* A stale pre-wallet payload must fail to the error state, never RpNaN. */
    phase = "stale";
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.locator('[aria-label="Memuat ringkasan"]')).toBeVisible();
    await expect(page.getByText("Ringkasan keuangan belum bisa dimuat.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("NaN");
    await expect(page.getByRole("heading", { name: "Pengeluaran bulan ini" })).toHaveCount(0);

    phase = "ok";
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.locator('[aria-label="Memuat ringkasan"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pengeluaran bulan ini" })).toBeVisible();
    await expect(page.getByText("Ringkasan keuangan belum bisa dimuat.")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("NaN");
  });
});

test.describe("activity filtered-empty state (AC-F2-8)", () => {
  test("shows the filtered-empty state when a filter matches nothing", async ({ page }) => {
    await page.route("**/api/dashboard**", (route) => fulfillJson(route, ONE_ROW_DASHBOARD));
    await page.route("**/api/transactions**", (route) =>
      fulfillJson(route, { rows: [], nextCursor: null }),
    );

    await page.goto("/home");
    await expect(page.getByText("Belanja state E2E")).toBeVisible();

    await page.getByRole("button", { name: "Struk hasil scan" }).click();
    await expect(page.getByText("Tidak ada aktivitas yang cocok")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset filter" }).first()).toBeVisible();

    /* Reset leaves the filtered path and restores the initial rows. */
    await page.getByRole("button", { name: "Reset filter" }).first().click();
    await expect(page.getByText("Belanja state E2E")).toBeVisible();
    await expect(page.getByText("Tidak ada aktivitas yang cocok")).toHaveCount(0);
  });
});
