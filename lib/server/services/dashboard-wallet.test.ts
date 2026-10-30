import { beforeEach, describe, expect, it } from "vitest";
import { BudgetService } from "./budget";
import { DashboardService } from "./dashboard";
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
const OWNER = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const WP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WARCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WP2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const NOW = new Date("2026-10-15T05:00:00Z");
const actor = { userId: MEMBER, householdId: HOUSEHOLD, role: "MEMBER" };
const other = { userId: OTHER, householdId: HOUSEHOLD, role: "MEMBER" };

function wallet(overrides: Partial<WalletRecord>): WalletRecord {
  return {
    id: crypto.randomUUID(),
    householdId: HOUSEHOLD,
    createdByUserId: OWNER,
    createdByDisplayName: "Owner",
    scope: "SHARING",
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

function setup(): { service: DashboardService; store: DashboardFakeStore } {
  const store = createDashboardFakeStore();
  const fake = createDashboardFake(store);
  store.wallets.push(
    wallet({ id: DEFAULT_WALLET_ID, scope: "SHARING", name: "Keluarga" }),
    wallet({ id: WP, scope: "PERSONAL", createdByUserId: MEMBER, name: "Tabungan" }),
    wallet({ id: WARCH, scope: "SHARING", name: "Lama", archivedAt: new Date() }),
    wallet({ id: WP2, scope: "PERSONAL", createdByUserId: OTHER, name: "Rahasia" }),
  );
  store.transactions.push(
    fakeTransaction({ householdId: HOUSEHOLD, walletId: DEFAULT_WALLET_ID, type: "MONEY_IN", amountMinor: 1_000, occurredAt: NOW }),
    fakeTransaction({ householdId: HOUSEHOLD, walletId: WP, type: "MONEY_IN", amountMinor: 500, occurredAt: NOW }),
    fakeTransaction({ householdId: HOUSEHOLD, walletId: WARCH, type: "MONEY_IN", amountMinor: 200, occurredAt: NOW }),
    fakeTransaction({ householdId: HOUSEHOLD, walletId: WP2, type: "MONEY_IN", amountMinor: 900, occurredAt: NOW }),
  );
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

describe("DashboardService wallet split (AC-F6-7, AC-F6-11)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("reports shared and personal totals separately, including archived (A-44/C-18)", async () => {
    const dto = await ctx.service.get(actor, { periodDays: 7, now: NOW });
    expect(dto.sharedBalanceMinor).toBe(1_200);
    expect(dto.personalBalanceMinor).toBe(500);
  });

  it("never exposes another member's PERSONAL balance (AC-F6-2)", async () => {
    const dto = await ctx.service.get(other, { periodDays: 7, now: NOW });
    expect(dto.personalBalanceMinor).toBe(900);
    expect(dto.sharedBalanceMinor).toBe(1_200);
  });

  it("returns active wallets only in the carousel (A-44)", async () => {
    const dto = await ctx.service.get(actor, { periodDays: 7, now: NOW });
    const ids = dto.wallets.map((entry) => entry.id);
    expect(ids).toContain(DEFAULT_WALLET_ID);
    expect(ids).toContain(WP);
    expect(ids).not.toContain(WARCH);
    expect(ids).not.toContain(WP2);
  });

  it("excludes PERSONAL spending from the household spending aggregate (AC-F6-8)", async () => {
    ctx.store.transactions.push(
      fakeTransaction({ householdId: HOUSEHOLD, walletId: DEFAULT_WALLET_ID, type: "MONEY_OUT", amountMinor: 300, occurredAt: NOW }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: WP, type: "MONEY_OUT", amountMinor: 700, occurredAt: NOW }),
    );
    const dto = await ctx.service.get(actor, { periodDays: 7, now: NOW });
    expect(dto.spending.totalOutMinor).toBe(300);
  });
});
