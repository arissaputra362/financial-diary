import { beforeEach, describe, expect, it } from "vitest";
import {
  bucketByJakartaDay,
  DashboardService,
  toGoalSummaryDTO,
} from "./dashboard";
import { BudgetService } from "./budget";
import { PeriodService } from "./period";
import {
  createDashboardFake,
  createDashboardFakeStore,
  DEFAULT_WALLET_ID,
  fakeTransaction,
  type DashboardFakeStore,
} from "../testing/dashboard-fakes";
import type { WalletRecord } from "../repositories/ledger";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACTOR = { userId: "33333333-3333-4333-8333-333333333333", householdId: HOUSEHOLD, role: "OWNER" };
const NOW = new Date("2026-10-15T05:00:00Z"); // 15 Oct 2026 12:00 WIB

function setup(): { service: DashboardService; store: DashboardFakeStore } {
  const store = createDashboardFakeStore();
  const fake = createDashboardFake(store);
  const periods = new PeriodService();
  const budget = new BudgetService(
    fake.budget,
    fake.personalBudget,
    fake.transaction,
    fake.householdCycle,
    fake.personalCycle,
    periods,
  );
  return {
    store,
    service: new DashboardService({ transaction: fake.transaction, wallet: fake.wallet }, fake.goal, budget, periods),
  };
}

function fakeWallet(overrides: Partial<WalletRecord>): WalletRecord {
  return {
    id: crypto.randomUUID(),
    householdId: HOUSEHOLD,
    createdByUserId: ACTOR.userId,
    createdByDisplayName: "Owner",
    scope: "PERSONAL",
    name: "Dompet",
    purpose: null,
    openingBalanceMinor: 0,
    officialInstitutionId: null,
    customInstitutionId: null,
    institution: null,
    archivedAt: null,
    archivedByUserId: null,
    systemKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function seedHousehold(store: DashboardFakeStore): void {
  store.transactions.push(
    fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_IN", amountMinor: 1_000_000, occurredAt: new Date("2026-10-01T05:00:00Z") }),
    fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 100_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
    /* Boundary: 2026-09-30T17:30:00Z is 1 Oct 00:30 WIB -> Oct 1 bucket (AC-F2-5). */
    fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 50_000, occurredAt: new Date("2026-09-30T17:30:00Z") }),
    /* Transfer legs must not count as spending and net to zero in balance (AC-F2-4). */
    fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 300_000, occurredAt: new Date("2026-10-03T05:00:00Z"), transferGroupId: "tg-1" }),
    fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_IN", amountMinor: 300_000, occurredAt: new Date("2026-10-03T05:00:00Z"), transferGroupId: "tg-1" }),
    /* Soft-deleted rows are invisible to every aggregate (AC-F2-1). */
    fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 999_999, occurredAt: new Date("2026-10-04T05:00:00Z"), deletedAt: new Date("2026-10-05T05:00:00Z") }),
  );
}

describe("DashboardService.get (AC-F2-1, AC-F2-2, AC-F2-4, AC-F2-5)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
    seedHousehold(ctx.store);
  });

  it("computes balance = active MONEY_IN - active MONEY_OUT, transfers net zero", async () => {
    const dto = await ctx.service.get(ACTOR, { periodDays: 30, now: NOW });
    /* income 1,000,000 - outflow (100,000 + 50,000); transfer + deleted excluded. */
    expect(dto.sharedBalanceMinor).toBe(850_000);
  });

  it("buckets MONEY_OUT by Jakarta day and keeps empty days at 0", async () => {
    const dto = await ctx.service.get(ACTOR, { periodDays: 30, now: NOW });
    const byDate = new Map(dto.spending.byDay.map((day) => [day.date, day.amountMinor]));
    expect(byDate.get("2026-10-01")).toBe(50_000);
    expect(byDate.get("2026-10-02")).toBe(0);
    expect(byDate.get("2026-10-05")).toBe(100_000);
    /* The transfer on Oct 3 is not plotted. */
    expect(byDate.get("2026-10-03")).toBe(0);
    expect(dto.spending.totalOutMinor).toBe(150_000);
    expect(dto.spending.byDay).toHaveLength(30);
  });

  it("scopes the chart window to the requested number of days", async () => {
    const dto = await ctx.service.get(ACTOR, { periodDays: 7, now: NOW });
    expect(dto.spending.byDay).toHaveLength(7);
    expect(dto.spending.periodEnd).toBe("2026-10-15");
    expect(dto.spending.periodStart).toBe("2026-10-09");
  });

  it("includes the budget block and only active goals capped at 100 (AC-F2-9)", async () => {
    ctx.store.goals.push(
      { id: "g1", householdId: HOUSEHOLD, name: "Liburan", targetAmountMinor: 100, savedAmountMinor: 50, deadline: null, deletedAt: null },
      { id: "g2", householdId: HOUSEHOLD, name: "Dana Darurat", targetAmountMinor: 100, savedAmountMinor: 250, deadline: new Date("2026-12-31T00:00:00Z"), deletedAt: null },
      { id: "g3", householdId: HOUSEHOLD, name: "Terhapus", targetAmountMinor: 100, savedAmountMinor: 10, deadline: null, deletedAt: new Date() },
    );
    const dto = await ctx.service.get(ACTOR, { periodDays: 30, now: NOW });
    expect(dto.goals).toHaveLength(2);
    expect(dto.goals.find((g) => g.id === "g1")?.progressPercent).toBe(50);
    expect(dto.goals.find((g) => g.id === "g2")?.progressPercent).toBe(100);
    expect(dto.monthlyBudget.isSet).toBe(false);
  });

  it("isolates one household from another (ADR-006)", async () => {
    ctx.store.transactions.push(
      fakeTransaction({ householdId: OTHER, type: "MONEY_OUT", amountMinor: 5_000_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
    );
    const dto = await ctx.service.get(ACTOR, { periodDays: 30, now: NOW });
    expect(dto.sharedBalanceMinor).toBe(850_000);
    expect(dto.spending.totalOutMinor).toBe(150_000);
  });

  it("adds personal budget/spending with the owner-filtered scope, leaving shared fields unchanged", async () => {
    const personalActor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const personalArchived = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const personalOther = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    ctx.store.wallets.push(
      fakeWallet({ id: personalActor, createdByUserId: ACTOR.userId, scope: "PERSONAL" }),
      fakeWallet({
        id: personalArchived,
        createdByUserId: ACTOR.userId,
        scope: "PERSONAL",
        archivedAt: new Date("2026-09-30T00:00:00Z"),
      }),
      fakeWallet({ id: personalOther, createdByUserId: OTHER, scope: "PERSONAL" }),
    );
    ctx.store.transactions.push(
      fakeTransaction({ householdId: HOUSEHOLD, walletId: personalActor, type: "MONEY_OUT", amountMinor: 40_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: personalArchived, type: "MONEY_OUT", amountMinor: 10_000, occurredAt: new Date("2026-10-06T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: personalOther, type: "MONEY_OUT", amountMinor: 900_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: personalActor, type: "MONEY_OUT", amountMinor: 500_000, occurredAt: new Date("2026-10-07T05:00:00Z"), transferGroupId: "tg-personal" }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: DEFAULT_WALLET_ID, type: "MONEY_OUT", amountMinor: 25_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
    );
    ctx.store.personalBudgets.push({
      id: "pb-1",
      householdId: HOUSEHOLD,
      userId: ACTOR.userId,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      amountMinor: 300_000,
      createdByUserId: ACTOR.userId,
    });

    const dto = await ctx.service.get(ACTOR, { periodDays: 30, now: NOW });

    expect(dto.personalMonthlyBudget).toMatchObject({
      scope: "PERSONAL",
      isSet: true,
      budgetMinor: 300_000,
      spentMinor: 50_000,
      remainingMinor: 250_000,
    });
    expect(dto.personalSpending.totalOutMinor).toBe(50_000);
    expect(dto.personalSpending.byDay).toHaveLength(30);

    /* Shared fields keep their SHARING meaning: seed 150,000 + 25,000. */
    expect(dto.monthlyBudget.scope).toBe("SHARED");
    expect(dto.spending.totalOutMinor).toBe(175_000);
  });
});

describe("dashboard helpers", () => {
  it("bucketByJakartaDay maps a UTC instant onto its Jakarta calendar day", () => {
    const buckets = ["2026-09-30", "2026-10-01"];
    const result = bucketByJakartaDay(buckets, [{ date: new Date("2026-09-30T17:30:00Z"), amountMinor: 42 }]);
    expect(result).toEqual([
      { date: "2026-09-30", amountMinor: 0 },
      { date: "2026-10-01", amountMinor: 42 },
    ]);
  });

  it("toGoalSummaryDTO caps progress at 100 and never exceeds it", () => {
    expect(toGoalSummaryDTO({ id: "g", name: "x", targetAmountMinor: 10, savedAmountMinor: 10, deadline: null }).progressPercent).toBe(100);
    expect(toGoalSummaryDTO({ id: "g", name: "x", targetAmountMinor: 10, savedAmountMinor: 999, deadline: null }).progressPercent).toBe(100);
    expect(toGoalSummaryDTO({ id: "g", name: "x", targetAmountMinor: 0, savedAmountMinor: 5, deadline: null }).progressPercent).toBe(0);
  });
});
