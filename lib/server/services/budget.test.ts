import { beforeEach, describe, expect, it } from "vitest";
import {
  createDashboardFake,
  createDashboardFakeStore,
  DEFAULT_WALLET_ID,
  fakeTransaction,
  type DashboardFakeStore,
} from "../testing/dashboard-fakes";
import type { WalletRecord } from "../repositories/ledger";
import { BudgetService } from "./budget";
import { PeriodService } from "./period";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const OWNER = { userId: OWNER_ID, role: "OWNER", householdId: HOUSEHOLD };
const MEMBER = { userId: MEMBER_ID, role: "MEMBER", householdId: HOUSEHOLD };
const NOW = new Date("2026-10-15T05:00:00Z"); // 15 Oct 2026 12:00 WIB

const WP_MEMBER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WP_ARCHIVED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WP_OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function setup(): { service: BudgetService; store: DashboardFakeStore } {
  const store = createDashboardFakeStore();
  const fake = createDashboardFake(store);
  return {
    store,
    service: new BudgetService(
      fake.budget,
      fake.personalBudget,
      fake.transaction,
      fake.householdCycle,
      fake.personalCycle,
      new PeriodService(),
    ),
  };
}

function fakeWallet(overrides: Partial<WalletRecord>): WalletRecord {
  return {
    id: crypto.randomUUID(),
    householdId: HOUSEHOLD,
    createdByUserId: OWNER_ID,
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

describe("BudgetService.get (AC-F2-2, shared scope)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("returns the 'atur budget' state (not a misleading 0) when no row exists", async () => {
    const dto = await ctx.service.get(HOUSEHOLD, NOW);
    expect(dto.scope).toBe("SHARED");
    expect(dto.isSet).toBe(false);
    expect(dto.budgetMinor).toBeNull();
    expect(dto.remainingMinor).toBeNull();
    expect(dto.spentMinor).toBe(0);
    expect(dto.periodStart).toBe("2026-10-01");
    expect(dto.periodEnd).toBe("2026-10-31");
  });

  it("computes spent from active MONEY_OUT in the month and excludes transfers", async () => {
    ctx.store.transactions.push(
      fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 90_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 10_000, occurredAt: new Date("2026-09-10T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 500_000, occurredAt: new Date("2026-10-06T05:00:00Z"), transferGroupId: "tg-1" }),
      fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_IN", amountMinor: 500_000, occurredAt: new Date("2026-10-06T05:00:00Z"), transferGroupId: "tg-1" }),
      fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 77_000, occurredAt: new Date("2026-10-07T05:00:00Z"), deletedAt: new Date("2026-10-08T05:00:00Z") }),
    );
    const dto = await ctx.service.get(HOUSEHOLD, NOW);
    expect(dto.spentMinor).toBe(90_000);
  });

  it("computes remaining = budget - spent", async () => {
    ctx.store.budgets.push({ id: "b1", householdId: HOUSEHOLD, periodStart: new Date("2026-10-01T00:00:00Z"), amountMinor: 1_000_000, createdByUserId: OWNER_ID });
    ctx.store.transactions.push(
      fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_OUT", amountMinor: 250_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
    );
    const dto = await ctx.service.get(HOUSEHOLD, NOW);
    expect(dto.isSet).toBe(true);
    expect(dto.budgetMinor).toBe(1_000_000);
    expect(dto.remainingMinor).toBe(750_000);
  });
});

describe("BudgetService.upsert (AC-F2-3, shared scope)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("upserts for the owner without creating a duplicate row for the same month", async () => {
    await ctx.service.upsert(OWNER, HOUSEHOLD, 500_000, "SHARED", NOW);
    await ctx.service.upsert(OWNER, HOUSEHOLD, 750_000, "SHARED", NOW);
    expect(ctx.store.budgets).toHaveLength(1);
    expect(ctx.store.budgets[0]?.amountMinor).toBe(750_000);
    expect(ctx.store.budgets[0]?.periodStart.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(ctx.store.personalBudgets).toHaveLength(0);
  });

  it("rejects a member with a typed 403 and leaves the shared budget untouched", async () => {
    await expect(ctx.service.upsert(MEMBER, HOUSEHOLD, 500_000, "SHARED", NOW)).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCESS_DENIED",
    });
    expect(ctx.store.budgets).toHaveLength(0);
  });

  it("rejects amount 0 or negative with 422", async () => {
    await expect(ctx.service.upsert(OWNER, HOUSEHOLD, 0, "SHARED", NOW)).rejects.toMatchObject({ statusCode: 422 });
    await expect(ctx.service.upsert(OWNER, HOUSEHOLD, -10, "SHARED", NOW)).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("BudgetService personal scope (AC-F2-2c)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
    ctx.store.wallets.push(
      fakeWallet({ id: WP_MEMBER, createdByUserId: MEMBER_ID, scope: "PERSONAL", name: "Pribadi anggota" }),
      fakeWallet({
        id: WP_ARCHIVED,
        createdByUserId: MEMBER_ID,
        scope: "PERSONAL",
        name: "Pribadi arsip",
        archivedAt: new Date("2026-09-30T00:00:00Z"),
      }),
      fakeWallet({ id: WP_OWNER, createdByUserId: OWNER_ID, scope: "PERSONAL", name: "Pribadi owner" }),
    );
  });

  it("returns an unset personal budget when the user has no row", async () => {
    const dto = await ctx.service.getPersonal(MEMBER, NOW);
    expect(dto.scope).toBe("PERSONAL");
    expect(dto.isSet).toBe(false);
    expect(dto.budgetMinor).toBeNull();
    expect(dto.remainingMinor).toBeNull();
    expect(dto.spentMinor).toBe(0);
    expect(dto.periodStart).toBe("2026-10-01");
    expect(dto.periodEnd).toBe("2026-10-31");
  });

  it("lets a member write only their own personal row, without duplicates", async () => {
    await ctx.service.upsert(MEMBER, HOUSEHOLD, 400_000, "PERSONAL", NOW);
    const dto = await ctx.service.upsert(MEMBER, HOUSEHOLD, 600_000, "PERSONAL", NOW);
    expect(dto).toMatchObject({ scope: "PERSONAL", isSet: true, budgetMinor: 600_000 });
    expect(ctx.store.personalBudgets).toHaveLength(1);
    expect(ctx.store.personalBudgets[0]?.userId).toBe(MEMBER_ID);
    expect(ctx.store.personalBudgets[0]?.createdByUserId).toBe(MEMBER_ID);
    expect(ctx.store.budgets).toHaveLength(0);
  });

  it("counts spent only from the actor's PERSONAL wallets, archived included, transfers excluded", async () => {
    ctx.store.transactions.push(
      fakeTransaction({ householdId: HOUSEHOLD, walletId: WP_MEMBER, type: "MONEY_OUT", amountMinor: 100_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: WP_ARCHIVED, type: "MONEY_OUT", amountMinor: 50_000, occurredAt: new Date("2026-10-06T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: WP_OWNER, type: "MONEY_OUT", amountMinor: 900_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: DEFAULT_WALLET_ID, type: "MONEY_OUT", amountMinor: 300_000, occurredAt: new Date("2026-10-05T05:00:00Z") }),
      fakeTransaction({ householdId: HOUSEHOLD, walletId: WP_MEMBER, type: "MONEY_OUT", amountMinor: 500_000, occurredAt: new Date("2026-10-06T05:00:00Z"), transferGroupId: "tg-personal" }),
    );
    const personal = await ctx.service.getPersonal(MEMBER, NOW);
    const shared = await ctx.service.get(HOUSEHOLD, NOW);
    expect(personal.spentMinor).toBe(150_000);
    expect(shared.spentMinor).toBe(300_000);
  });

  it("never lets the owner read or overwrite another user's personal budget", async () => {
    await ctx.service.upsert(MEMBER, HOUSEHOLD, 400_000, "PERSONAL", NOW);
    const ownerView = await ctx.service.getPersonal(OWNER, NOW);
    expect(ownerView.isSet).toBe(false);
    expect(ownerView.budgetMinor).toBeNull();

    await ctx.service.upsert(OWNER, HOUSEHOLD, 700_000, "PERSONAL", NOW);
    const memberRow = ctx.store.personalBudgets.find((row) => row.userId === MEMBER_ID);
    const ownerRow = ctx.store.personalBudgets.find((row) => row.userId === OWNER_ID);
    expect(memberRow?.amountMinor).toBe(400_000);
    expect(ownerRow?.amountMinor).toBe(700_000);
    expect(ctx.store.personalBudgets).toHaveLength(2);
  });

  it("keeps the calendar month cycle as the default", async () => {
    const dto = await ctx.service.get(HOUSEHOLD, NOW);
    expect(dto.cycle).toEqual({ mode: "CALENDAR_MONTH", day: null });
    expect(dto.nextCycle).toBeNull();
  });

  it("applies a cycle immediately when the current period has no budget yet", async () => {
    const dto = await ctx.service.updateCycle(
      OWNER,
      HOUSEHOLD,
      { mode: "FIXED_DAY", day: 10 },
      "SHARED",
      NOW,
    );
    expect(dto.periodStart).toBe("2026-10-10");
    expect(dto.periodEnd).toBe("2026-11-09");
    expect(dto.cycle).toEqual({ mode: "FIXED_DAY", day: 10 });
    expect(dto.nextCycle).toBeNull();
    expect(dto.isSet).toBe(false);
    expect(ctx.store.householdCycles.get(HOUSEHOLD)).toMatchObject({
      mode: "FIXED_DAY",
      day: 10,
      pendingMode: null,
      pendingEffectiveFrom: null,
    });
  });

  it("schedules a shared cycle change for the next boundary when this period already has a budget", async () => {
    ctx.store.budgets.push({
      id: "b-oct",
      householdId: HOUSEHOLD,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      amountMinor: 1_000_000,
      createdByUserId: OWNER_ID,
    });
    const dto = await ctx.service.updateCycle(
      OWNER,
      HOUSEHOLD,
      { mode: "FIXED_DAY", day: 10 },
      "SHARED",
      NOW,
    );
    expect(dto.periodStart).toBe("2026-10-01");
    expect(dto.periodEnd).toBe("2026-10-31");
    expect(dto.cycle).toEqual({ mode: "CALENDAR_MONTH", day: null });
    expect(dto.nextCycle).toEqual({
      mode: "FIXED_DAY",
      day: 10,
      effectiveFrom: "2026-11-10",
    });
  });

  it("uses the pending cycle from its effective date and starts unset", async () => {
    ctx.store.budgets.push({
      id: "b-oct",
      householdId: HOUSEHOLD,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      amountMinor: 1_000_000,
      createdByUserId: OWNER_ID,
    });
    await ctx.service.updateCycle(OWNER, HOUSEHOLD, { mode: "FIXED_DAY", day: 10 }, "SHARED", NOW);

    const before = await ctx.service.get(HOUSEHOLD, new Date("2026-11-05T05:00:00Z"));
    expect(before.periodStart).toBe("2026-11-01");
    expect(before.periodEnd).toBe("2026-11-30");

    const after = await ctx.service.get(HOUSEHOLD, new Date("2026-11-10T05:00:00Z"));
    expect(after.periodStart).toBe("2026-11-10");
    expect(after.periodEnd).toBe("2026-12-09");
    expect(after.cycle).toEqual({ mode: "FIXED_DAY", day: 10 });
    expect(after.nextCycle).toBeNull();
    expect(after.isSet).toBe(false);
    expect(after.budgetMinor).toBeNull();
  });

  it("rejects a member changing the shared cycle", async () => {
    await expect(
      ctx.service.updateCycle(MEMBER, HOUSEHOLD, { mode: "END_OF_MONTH", day: null }, "SHARED", NOW),
    ).rejects.toMatchObject({ statusCode: 403, code: "ACCESS_DENIED" });
  });

  it("lets a member change only their own personal cycle", async () => {
    ctx.store.personalBudgets.push({
      id: "pb-member-oct",
      householdId: HOUSEHOLD,
      userId: MEMBER_ID,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      amountMinor: 400_000,
      createdByUserId: MEMBER_ID,
    });
    const personal = await ctx.service.updateCycle(
      MEMBER,
      HOUSEHOLD,
      { mode: "FIXED_DAY", day: 5 },
      "PERSONAL",
      NOW,
    );
    expect(personal.nextCycle).toEqual({
      mode: "FIXED_DAY",
      day: 5,
      effectiveFrom: "2026-11-05",
    });
    expect(ctx.store.householdCycles.size).toBe(0);
    expect(ctx.store.personalCycles.get(MEMBER_ID)?.pendingMode).toBe("FIXED_DAY");
    expect(ctx.store.personalCycles.has(OWNER_ID)).toBe(false);
  });

  it("applies a personal cycle immediately when this period has no personal budget", async () => {
    const personal = await ctx.service.updateCycle(
      MEMBER,
      HOUSEHOLD,
      { mode: "END_OF_MONTH", day: null },
      "PERSONAL",
      NOW,
    );
    expect(personal.periodStart).toBe("2026-09-30");
    expect(personal.periodEnd).toBe("2026-10-30");
    expect(personal.cycle).toEqual({ mode: "END_OF_MONTH", day: null });
    expect(personal.nextCycle).toBeNull();
    expect(ctx.store.personalCycles.get(MEMBER_ID)?.mode).toBe("END_OF_MONTH");
    expect(ctx.store.householdCycles.size).toBe(0);
  });

  it("rejects a fixed day outside 1 to 28", async () => {
    await expect(
      ctx.service.updateCycle(OWNER, HOUSEHOLD, { mode: "FIXED_DAY", day: 29 }, "SHARED", NOW),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("never sums personal and shared amounts", async () => {
    ctx.store.budgets.push({
      id: "shared-1",
      householdId: HOUSEHOLD,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      amountMinor: 1_000_000,
      createdByUserId: OWNER_ID,
    });
    await ctx.service.upsert(MEMBER, HOUSEHOLD, 400_000, "PERSONAL", NOW);
    const personal = await ctx.service.getPersonal(MEMBER, NOW);
    const shared = await ctx.service.get(HOUSEHOLD, NOW);
    expect(personal.budgetMinor).toBe(400_000);
    expect(shared.budgetMinor).toBe(1_000_000);
    expect(personal.remainingMinor).not.toBe(shared.remainingMinor);
  });
});
