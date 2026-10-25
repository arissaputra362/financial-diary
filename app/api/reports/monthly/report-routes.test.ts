import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import { jakartaDateOnly } from "@/lib/server/jakarta";
import { BudgetService } from "@/lib/server/services/budget";
import { DashboardService } from "@/lib/server/services/dashboard";
import { PeriodService } from "@/lib/server/services/period";
import { ReportService } from "@/lib/server/services/report";
import {
  createDashboardFake,
  createDashboardFakeStore,
  fakeTransaction,
} from "@/lib/server/testing/dashboard-fakes";
import { createReportFake, fakeReportWallet } from "@/lib/server/testing/report-fakes";
import { GET as reportGet } from "./route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";
const SHARED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHARED_TWO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSONAL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_PERSONAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NEW_WALLET = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type Harness = ReturnType<typeof buildHarness>;

function at(month: string, day: number, hour = 12): Date {
  return new Date(`${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+07:00`);
}

function buildHarness(options: { personal?: boolean; role?: string } = {}) {
  const role = options.role ?? "OWNER";
  const store = createDashboardFakeStore();
  store.wallets.push(
    fakeReportWallet({
      id: SHARED,
      householdId: HOUSEHOLD,
      name: "Dompet Keluarga",
      scope: "SHARING",
      openingBalanceMinor: 1_000_000,
    }),
    fakeReportWallet({
      id: SHARED_TWO,
      householdId: HOUSEHOLD,
      name: "Dompet Belanja",
      scope: "SHARING",
      openingBalanceMinor: 0,
    }),
  );
  if (options.personal !== false) {
    store.wallets.push(
      fakeReportWallet({
        id: PERSONAL,
        householdId: HOUSEHOLD,
        createdByUserId: USER,
        name: "Dompet Pribadi",
        scope: "PERSONAL",
        openingBalanceMinor: 500_000,
      }),
      fakeReportWallet({
        id: OTHER_PERSONAL,
        householdId: HOUSEHOLD,
        createdByUserId: OTHER_USER,
        name: "Dompet Orang Lain",
        scope: "PERSONAL",
        openingBalanceMinor: 9_000_000,
      }),
    );
  }

  const periods = new PeriodService();
  const dashboardFake = createDashboardFake(store);
  const budget = new BudgetService(
    dashboardFake.budget,
    dashboardFake.personalBudget,
    dashboardFake.transaction,
    periods,
  );
  const dashboard = new DashboardService(
    { transaction: dashboardFake.transaction, wallet: dashboardFake.wallet },
    dashboardFake.goal,
    budget,
    periods,
  );
  const reports = new ReportService(createReportFake(store), periods);

  const context: AuthenticatedContext = {
    state: {
      user: { id: USER, email: "ana@example.com", displayName: "Ana" },
      household: { id: HOUSEHOLD, name: "Keluarga Ana" },
      role,
      status: "APPROVED",
      nextAction: "OPEN_HOME",
    },
    userId: USER,
    householdId: HOUSEHOLD,
    role,
    sessionId: "sid-1",
    auth: {} as AuthenticatedContext["auth"],
    family: {} as AuthenticatedContext["family"],
    transactions: {} as AuthenticatedContext["transactions"],
    wallets: {} as AuthenticatedContext["wallets"],
    institutions: {} as AuthenticatedContext["institutions"],
    ocr: {} as AuthenticatedContext["ocr"],
    dashboard,
    reports,
    budget,
    goals: {} as AuthenticatedContext["goals"],
    advisor: {} as AuthenticatedContext["advisor"],
  };
  return { context, store, periods };
}

function tx(
  overrides: Partial<Parameters<typeof fakeTransaction>[0]> & { month: string; day: number },
) {
  const { month, day, ...rest } = overrides;
  return fakeTransaction({
    householdId: HOUSEHOLD,
    occurredAt: at(month, day),
    createdAt: at(month, day),
    ...rest,
  });
}

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("GET /api/reports/monthly", () => {
  let harness: Harness;

  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("returns the shared report and reconciles closing with the dashboard (AC-F7-3/9/14)", async () => {
    const month = jakartaDateOnly().slice(0, 7);
    const current = buildHarness();
    current.store.transactions.push(
      tx({ month, day: 1, type: "MONEY_IN", amountMinor: 1_000_000, walletId: SHARED, category: "salary" }),
      tx({ month, day: 2, type: "MONEY_OUT", amountMinor: 250_000, walletId: SHARED, category: "food" }),
    );
    vi.mocked(authenticatedRequest).mockResolvedValue(current.context);

    const response = await reportGet(
      new Request(`http://localhost/api/reports/monthly?month=${month}`),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      month,
      scope: "SHARED",
      wallet: null,
      openingMinor: 1_000_000,
      newWalletOpeningMinor: 0,
      moneyInMinor: 1_000_000,
      moneyOutMinor: 250_000,
      transferInMinor: 0,
      transferOutMinor: 0,
      closingMinor: 1_750_000,
    });
    const dashboard = await current.context.dashboard.get({
      userId: USER,
      householdId: HOUSEHOLD,
      role: "OWNER",
    });
    expect(body.closingMinor).toBe(dashboard.sharedBalanceMinor);
    expect(response.headers.get("set-cookie") ?? "").toContain("financial_planner_session=");
  });

  it("never mixes another member's personal wallets into the personal scope (AC-F7-7)", async () => {
    harness.store.transactions.push(
      tx({ month: "2026-10", day: 3, type: "MONEY_IN", amountMinor: 100_000, walletId: PERSONAL }),
      tx({ month: "2026-10", day: 4, type: "MONEY_IN", amountMinor: 900_000, walletId: OTHER_PERSONAL }),
    );
    const response = await reportGet(
      new Request("http://localhost/api/reports/monthly?month=2026-10&scope=personal"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scope).toBe("PERSONAL");
    expect(body.openingMinor).toBe(500_000);
    expect(body.moneyInMinor).toBe(100_000);
    expect(body.closingMinor).toBe(600_000);
  });

  it("narrows every figure to the selected wallet (AC-F7-8)", async () => {
    harness.store.transactions.push(
      tx({ month: "2026-10", day: 3, type: "MONEY_IN", amountMinor: 100_000, walletId: SHARED }),
      tx({ month: "2026-10", day: 3, type: "MONEY_OUT", amountMinor: 20_000, walletId: SHARED_TWO }),
    );
    const response = await reportGet(
      new Request(`http://localhost/api/reports/monthly?month=2026-10&walletId=${SHARED}`),
    );
    const body = await response.json();
    expect(body.wallet).toEqual({ id: SHARED, name: "Dompet Keluarga" });
    expect(body.openingMinor).toBe(1_000_000);
    expect(body.moneyInMinor).toBe(100_000);
    expect(body.moneyOutMinor).toBe(0);
    expect(body.closingMinor).toBe(1_100_000);
  });

  it("keeps an archived wallet in the report and in the scoped list (AC-F7-8)", async () => {
    const wallet = harness.store.wallets.find((row) => row.id === SHARED);
    if (wallet) wallet.archivedAt = new Date("2026-09-01T00:00:00+07:00");
    harness.store.transactions.push(
      tx({ month: "2026-10", day: 5, type: "MONEY_OUT", amountMinor: 50_000, walletId: SHARED }),
    );
    const response = await reportGet(
      new Request("http://localhost/api/reports/monthly?month=2026-10"),
    );
    const body = await response.json();
    expect(body.openingMinor).toBe(1_000_000);
    expect(body.moneyOutMinor).toBe(50_000);
    expect(body.closingMinor).toBe(950_000);
  });

  it("excludes transfer legs from Masuk/Keluar but keeps a same-scope transfer neutral (AC-F7-12)", async () => {
    harness.store.transactions.push(
      tx({ month: "2026-10", day: 6, type: "MONEY_OUT", amountMinor: 200_000, walletId: SHARED, transferGroupId: "11111111-1111-4111-8111-111111111111" }),
      tx({ month: "2026-10", day: 6, type: "MONEY_IN", amountMinor: 200_000, walletId: SHARED_TWO, transferGroupId: "11111111-1111-4111-8111-111111111111" }),
    );
    const response = await reportGet(
      new Request("http://localhost/api/reports/monthly?month=2026-10"),
    );
    const body = await response.json();
    expect(body.moneyInMinor).toBe(0);
    expect(body.moneyOutMinor).toBe(0);
    expect(body.transferInMinor).toBe(200_000);
    expect(body.transferOutMinor).toBe(200_000);
    expect(body.transferNetMinor).toBe(0);
    expect(body.closingMinor).toBe(1_000_000);
  });

  it("shows only its own leg of a cross-scope transfer (AC-F7-12)", async () => {
    harness.store.transactions.push(
      tx({ month: "2026-10", day: 7, type: "MONEY_OUT", amountMinor: 200_000, walletId: PERSONAL, transferGroupId: "22222222-2222-4222-8222-222222222222" }),
      tx({ month: "2026-10", day: 7, type: "MONEY_IN", amountMinor: 200_000, walletId: SHARED, transferGroupId: "22222222-2222-4222-8222-222222222222" }),
    );

    const shared = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    ).json();
    expect(shared.moneyInMinor).toBe(0);
    expect(shared.transferInMinor).toBe(200_000);
    expect(shared.transferOutMinor).toBe(0);
    expect(shared.closingMinor).toBe(1_200_000);

    const personal = await (
      await reportGet(
        new Request("http://localhost/api/reports/monthly?month=2026-10&scope=personal"),
      )
    ).json();
    expect(personal.moneyOutMinor).toBe(0);
    expect(personal.transferInMinor).toBe(0);
    expect(personal.transferOutMinor).toBe(200_000);
    expect(personal.closingMinor).toBe(300_000);
  });

  it("keeps the invariant for a wallet created during the period (AC-F7-4)", async () => {
    harness.store.wallets.push(
      fakeReportWallet({
        id: NEW_WALLET,
        householdId: HOUSEHOLD,
        name: "Dompet Baru",
        scope: "SHARING",
        openingBalanceMinor: 300_000,
        createdAt: at("2026-10", 10),
      }),
    );
    harness.store.transactions.push(
      tx({ month: "2026-10", day: 15, type: "MONEY_IN", amountMinor: 100_000, walletId: NEW_WALLET }),
    );
    const body = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    ).json();
    expect(body.openingMinor).toBe(1_000_000);
    expect(body.newWalletOpeningMinor).toBe(300_000);
    expect(body.moneyInMinor).toBe(100_000);
    expect(body.closingMinor).toBe(
      body.openingMinor +
        body.newWalletOpeningMinor +
        body.moneyInMinor -
        body.moneyOutMinor +
        body.transferInMinor -
        body.transferOutMinor,
    );
    expect(body.closingMinor).toBe(1_400_000);
  });

  it("includes a wallet created after the period when it has a backdated transaction (AC-F7-4 edge)", async () => {
    harness.store.wallets.push(
      fakeReportWallet({
        id: NEW_WALLET,
        householdId: HOUSEHOLD,
        name: "Dompet Backdate",
        scope: "SHARING",
        openingBalanceMinor: 100_000,
        createdAt: at("2026-11", 5),
      }),
    );
    harness.store.transactions.push(
      tx({ month: "2026-10", day: 20, type: "MONEY_IN", amountMinor: 50_000, walletId: NEW_WALLET }),
    );
    const body = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    ).json();
    expect(body.newWalletOpeningMinor).toBe(100_000);
    expect(body.moneyInMinor).toBe(50_000);
    expect(body.hasBackdatedNewWallet).toBe(true);
    expect(body.closingMinor).toBe(1_150_000);
  });

  it("does not include a wallet created after the period without activity (AC-F7-4 edge)", async () => {
    harness.store.wallets.push(
      fakeReportWallet({
        id: NEW_WALLET,
        householdId: HOUSEHOLD,
        name: "Dompet Masa Depan",
        scope: "SHARING",
        openingBalanceMinor: 900_000,
        createdAt: at("2026-11", 5),
      }),
    );
    const body = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    ).json();
    expect(body.openingMinor).toBe(1_000_000);
    expect(body.newWalletOpeningMinor).toBe(0);
    expect(body.closingMinor).toBe(1_000_000);
  });

  it("ignores soft-deleted transactions", async () => {
    harness.store.transactions.push(
      tx({
        month: "2026-10",
        day: 8,
        type: "MONEY_IN",
        amountMinor: 500_000,
        walletId: SHARED,
        deletedAt: at("2026-10", 9),
      }),
    );
    const body = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    ).json();
    expect(body.moneyInMinor).toBe(0);
    expect(body.closingMinor).toBe(1_000_000);
  });

  it("caps named categories at four and keeps Tanpa kategori and Lainnya auditable (AC-F7-5/6)", async () => {
    const amounts = [500, 400, 300, 200, 100];
    amounts.forEach((amount, index) => {
      harness.store.transactions.push(
        tx({
          month: "2026-10",
          day: 9,
          type: "MONEY_OUT",
          amountMinor: amount,
          walletId: SHARED,
          category: `cat-${index}`,
        }),
      );
    });
    harness.store.transactions.push(
      tx({
        month: "2026-10",
        day: 9,
        type: "MONEY_OUT",
        amountMinor: 50,
        walletId: SHARED,
        category: null,
      }),
    );
    const body = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    ).json();
    expect(body.expense.categories).toHaveLength(4);
    expect(body.expense.otherCategoryCount).toBe(1);
    expect(body.expense.otherAmountMinor).toBe(100);
    expect(body.expense.uncategorizedMinor).toBe(50);
    expect(body.expense.totalMinor).toBe(1_550);
    const rendered =
      body.expense.categories.reduce(
        (total: number, row: { amountMinor: number }) => total + row.amountMinor,
        0,
      ) +
      body.expense.otherAmountMinor +
      body.expense.uncategorizedMinor;
    expect(rendered).toBe(body.expense.totalMinor);
  });

  it("hides deltas without a comparator and signs them when one exists (AC-F7-10)", async () => {
    harness.store.transactions.push(
      tx({ month: "2026-10", day: 10, type: "MONEY_IN", amountMinor: 300_000, walletId: SHARED }),
    );
    const withoutComparator = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    ).json();
    expect(withoutComparator.delta).toEqual({
      closingMinor: null,
      moneyInMinor: null,
      moneyOutMinor: null,
    });

    harness.store.transactions.push(
      tx({ month: "2026-09", day: 10, type: "MONEY_IN", amountMinor: 100_000, walletId: SHARED }),
    );
    const withComparator = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    ).json();
    expect(withComparator.delta.moneyInMinor).toBe(200_000);
    /*
      September's inflow also raises October's opening balance, so the
      end-of-month closing delta equals October's own inflow (300_000).
    */
    expect(withComparator.delta.closingMinor).toBe(300_000);
  });

  it("returns one balance point for every day, including flat days (AC-F7-11)", async () => {
    harness.store.transactions.push(
      tx({ month: "2026-02", day: 3, type: "MONEY_IN", amountMinor: 100_000, walletId: SHARED }),
    );
    const body = await (
      await reportGet(new Request("http://localhost/api/reports/monthly?month=2026-02"))
    ).json();
    expect(body.dailyBalances).toHaveLength(28);
    expect(body.dailyBalances[0]).toEqual({ date: "2026-02-01", closingMinor: 1_000_000 });
    expect(body.dailyBalances[2]).toEqual({ date: "2026-02-03", closingMinor: 1_100_000 });
    expect(body.dailyBalances[27].closingMinor).toBe(body.closingMinor);
  });

  it("rejects malformed filters and foreign wallets (AC-F7-8)", async () => {
    const invalidMonth = await reportGet(
      new Request("http://localhost/api/reports/monthly?month=2026-13"),
    );
    expect(invalidMonth.status).toBe(422);
    const invalidScope = await reportGet(
      new Request("http://localhost/api/reports/monthly?scope=family"),
    );
    expect(invalidScope.status).toBe(422);
    const invalidWallet = await reportGet(
      new Request("http://localhost/api/reports/monthly?walletId=nope"),
    );
    expect(invalidWallet.status).toBe(422);
    const foreignWallet = await reportGet(
      new Request(`http://localhost/api/reports/monthly?walletId=${OTHER_PERSONAL}`),
    );
    expect(foreignWallet.status).toBe(404);
  });

  it("returns 422 for personal scope without a personal wallet (AC-F7-7)", async () => {
    const noPersonal = buildHarness({ personal: false });
    vi.mocked(authenticatedRequest).mockResolvedValue(noPersonal.context);
    const response = await reportGet(
      new Request("http://localhost/api/reports/monthly?scope=personal"),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "REPORT_SCOPE_UNAVAILABLE" },
    });
  });

  it("maps a PENDING member to a typed 403", async () => {
    const { forbidden } = await import("@/lib/server/errors");
    vi.mocked(authenticatedRequest).mockRejectedValue(
      forbidden("ACCESS_PENDING", "Akun Anda belum memiliki akses ke data keluarga."),
    );
    const response = await reportGet(new Request("http://localhost/api/reports/monthly"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCESS_PENDING" } });
  });

  it("defaults the month to the current Jakarta month", async () => {
    const response = await reportGet(
      new Request("http://localhost/api/reports/monthly?scope=shared"),
    );
    const body = await response.json();
    expect(body.month).toBe(jakartaDateOnly().slice(0, 7));
  });
});
