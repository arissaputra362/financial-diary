/*
  T-005 independent QA harness (QA-owned).

  Purpose: reproduce AC-F2-1..AC-F2-9 against the REAL local PostgreSQL and
  cross-check the service DTOs with raw SQL aggregates, so a passing suite is not
  merely "the service agreeing with itself".

  Run: bunx vitest run -c docs/qa/harness/t005.qa.config.mts
  Every row created here is deleted in afterEach/afterAll; no app code is touched.
*/

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createIntegrationPrisma } from "@/lib/server/testing/integration-db";
import {
  createBudgetRepository,
  createGoalRepository,
  createLedgerRepositories,
} from "@/lib/server/repositories/ledger";
import { BudgetService } from "@/lib/server/services/budget";
import { DashboardService } from "@/lib/server/services/dashboard";
import { PeriodService } from "@/lib/server/services/period";
import { parseListTransactionsQuery } from "@/lib/server/http";
import { AppError } from "@/lib/server/errors";

const NOW = new Date("2026-10-15T05:00:00Z"); // 15 Oct 2026 12:00 WIB
const RANGE_END = new Date("2026-10-15T16:59:59.999Z");

function services(prisma: PrismaClient) {
  const repos = createLedgerRepositories(prisma);
  const periods = new PeriodService();
  const budget = new BudgetService(createBudgetRepository(prisma), repos.transaction, periods);
  const dashboard = new DashboardService(
    repos.transaction,
    createGoalRepository(prisma),
    budget,
    periods,
  );
  return { repos, budget, dashboard, periods };
}

type House = { userId: string; householdId: string; email: string };

describe("T-005 independent QA harness", () => {
  let prisma: PrismaClient;
  const userIds: string[] = [];
  const householdIds: string[] = [];

  async function makeUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `qa-harness-${label}-${randomUUID()}@test.local`,
        passwordHash: "x",
        displayName: `QA ${label}`,
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function makeHousehold(ownerUserId: string): Promise<string> {
    const household = await prisma.household.create({
      data: { name: `QA Harness ${randomUUID()}`, ownerUserId },
    });
    householdIds.push(household.id);
    await prisma.membership.create({
      data: { householdId: household.id, userId: ownerUserId, role: "OWNER", status: "APPROVED", approvedAt: new Date() },
    });
    return household.id;
  }

  async function makeOwnerHouse(): Promise<House> {
    const userId = await makeUser("owner");
    const householdId = await makeHousehold(userId);
    return { userId, householdId, email: "" };
  }

  async function tx(householdId: string, userId: string, data: {
    type: "MONEY_IN" | "MONEY_OUT";
    amountMinor: number;
    occurredAt?: Date;
    transferGroupId?: string | null;
    deletedAt?: Date | null;
    source?: "MANUAL" | "OCR";
  }) {
    return prisma.transaction.create({
      data: {
        householdId,
        createdByUserId: userId,
        type: data.type,
        amountMinor: data.amountMinor,
        occurredAt: data.occurredAt ?? NOW,
        source: data.source ?? "MANUAL",
        transferGroupId: data.transferGroupId ?? null,
        deletedAt: data.deletedAt ?? null,
      },
    });
  }

  beforeAll(() => {
    prisma = createIntegrationPrisma();
  });

  afterEach(async () => {
    /* FK-safe cleanup: children first. */
    await prisma.transaction.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.savingsGoal.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdBudget.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.membership.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    householdIds.length = 0;
    userIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("AC-F2-1 balance excludes soft-deleted rows, nets transfer legs to zero, and matches raw SQL", async () => {
    const { userId, householdId } = await makeOwnerHouse();
    const g = randomUUID();
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: 5_000_000 });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 1_500_000 });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 777_777, deletedAt: new Date() });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 300_000, transferGroupId: g });
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: 300_000, transferGroupId: g });

    const { dashboard, repos } = services(prisma);
    const dto = await dashboard.get(householdId, { periodDays: 30, now: NOW });

    /* Raw SQL, independent of the repository code path. */
    const raw = await prisma.$queryRaw<Array<{ in_sum: bigint | null; out_sum: bigint | null }>>`
      SELECT
        (SELECT SUM(amount_minor) FROM "transaction"
           WHERE household_id = CAST(${householdId} AS uuid) AND deleted_at IS NULL AND type = 'MONEY_IN') AS in_sum,
        (SELECT SUM(amount_minor) FROM "transaction"
           WHERE household_id = CAST(${householdId} AS uuid) AND deleted_at IS NULL AND type = 'MONEY_OUT') AS out_sum
    `;
    const rawBalance = Number(raw[0]?.in_sum ?? 0) - Number(raw[0]?.out_sum ?? 0);
    console.log("[AC-F2-1] raw(in-out)=", rawBalance, "dto.balanceMinor=", dto.balanceMinor);

    expect(dto.balanceMinor).toBe(3_500_000);
    expect(dto.balanceMinor).toBe(rawBalance);

    /* Soft delete removes a row from balance immediately. */
    const out = await prisma.transaction.findFirst({ where: { householdId, type: "MONEY_OUT", transferGroupId: null, deletedAt: null, amountMinor: 1_500_000 } });
    await repos.transaction.softDelete(householdId, out!.id, userId);
    const afterDelete = await dashboard.get(householdId, { periodDays: 30, now: NOW });
    console.log("[AC-F2-1] balance after soft delete =", afterDelete.balanceMinor);
    /* Only income (5.0M) remains active; the 1.5M outflow is gone, transfers still net zero. */
    expect(afterDelete.balanceMinor).toBe(5_000_000);

    /* Restore brings it back. */
    await repos.transaction.restore(householdId, out!.id);
    const afterRestore = await dashboard.get(householdId, { periodDays: 30, now: NOW });
    expect(afterRestore.balanceMinor).toBe(3_500_000);
  });

  it("AC-F2-2/AC-F2-4 budget hides the unset state, computes spent excluding transfers/deleted, and upserts one row", async () => {
    const { userId, householdId } = await makeOwnerHouse();
    const g = randomUUID();
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 1_500_000 });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 50_000, occurredAt: new Date("2026-09-30T17:30:00Z") });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 999_999, deletedAt: new Date() });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 300_000, transferGroupId: g });
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: 300_000, transferGroupId: g });

    const { budget } = services(prisma);
    const unset = await budget.get(householdId, NOW);
    console.log("[AC-F2-2] unset state =", JSON.stringify(unset));
    expect(unset.isSet).toBe(false);
    expect(unset.budgetMinor).toBeNull();
    expect(unset.remainingMinor).toBeNull();
    /* The WIB-month boundary row (30 Sep 17:30Z = 1 Oct 00:30 WIB) counts in October. */
    expect(unset.spentMinor).toBe(1_550_000);
    expect(unset.periodStart).toBe("2026-10-01");
    expect(unset.periodEnd).toBe("2026-10-31");

    const actor = { userId, role: "OWNER" };
    const first = await budget.upsert(actor, householdId, 2_000_000, NOW);
    const second = await budget.upsert(actor, householdId, 3_000_000, NOW);
    console.log("[AC-F2-3] after two upserts =", JSON.stringify(second));

    const rows = await prisma.householdBudget.findMany({ where: { householdId } });
    console.log("[AC-F2-3] budget row count =", rows.length, "amount =", rows[0]?.amountMinor);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountMinor).toBe(3_000_000);
    expect(first.isSet).toBe(true);
    expect(second.budgetMinor).toBe(3_000_000);
    expect(second.remainingMinor).toBe(1_450_000);

    /* Non-owner write is rejected with a 403 (AC-F2-3). */
    await expect(budget.upsert({ userId, role: "MEMBER" }, householdId, 1_000_000, NOW)).rejects.toMatchObject({ statusCode: 403 });
    await expect(budget.upsert(actor, householdId, 0, NOW)).rejects.toMatchObject({ statusCode: 422 });
    await expect(budget.upsert(actor, householdId, -5, NOW)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("AC-F2-5 byDay buckets the 30 Sep 17:30Z instant into 1 Oct WIB, keeps empty days, and sizes 7/30/90", async () => {
    const { userId, householdId } = await makeOwnerHouse();
    const g = randomUUID();
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 1_500_000 });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 50_000, occurredAt: new Date("2026-09-30T17:30:00Z") });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 400_000, transferGroupId: g });

    const { dashboard } = services(prisma);
    const d30 = await dashboard.get(householdId, { periodDays: 30, now: NOW });
    const oct1 = d30.spending.byDay.find((d) => d.date === "2026-10-01");
    const sep30 = d30.spending.byDay.find((d) => d.date === "2026-09-30");
    console.log("[AC-F2-5] 30D length=", d30.spending.byDay.length, "oct1=", oct1?.amountMinor, "sep30=", sep30?.amountMinor, "total=", d30.spending.totalOutMinor);
    expect(d30.spending.byDay).toHaveLength(30);
    expect(oct1?.amountMinor).toBe(50_000);
    expect(sep30?.amountMinor).toBe(0);
    /* Transfer leg (400k) must not appear anywhere in the chart. */
    expect(d30.spending.totalOutMinor).toBe(1_550_000);
    expect(d30.spending.byDay.every((d) => d.amountMinor === 0 || d.amountMinor === 1_500_000 || d.amountMinor === 50_000)).toBe(true);
    expect(d30.spending.byDay.reduce((s, d) => s + d.amountMinor, 0)).toBe(1_550_000);
    expect(d30.spending.periodEnd).toBe("2026-10-15");

    const d7 = await dashboard.get(householdId, { periodDays: 7, now: NOW });
    const d90 = await dashboard.get(householdId, { periodDays: 90, now: NOW });
    console.log("[AC-F2-5] 7D length=", d7.spending.byDay.length, "90D length=", d90.spending.byDay.length);
    expect(d7.spending.byDay).toHaveLength(7);
    expect(d90.spending.byDay).toHaveLength(90);
    /* 7D window ends 15 Oct and starts 9 Oct, so the 1 Oct bucket is out of range. */
    expect(d7.spending.byDay.find((d) => d.date === "2026-10-01")).toBeUndefined();
    expect(d7.spending.totalOutMinor).toBe(1_500_000);
  });

  it("AC-F2-4 only-transfer household yields spent 0, flat chart, net-zero balance", async () => {
    const { userId, householdId } = await makeOwnerHouse();
    const g1 = randomUUID();
    const g2 = randomUUID();
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 250_000, transferGroupId: g1 });
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: 250_000, transferGroupId: g1 });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 1_000_000, transferGroupId: g2 });
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: 1_000_000, transferGroupId: g2 });

    const { dashboard, budget } = services(prisma);
    const dto = await dashboard.get(householdId, { periodDays: 30, now: NOW });
    const b = await budget.get(householdId, NOW);
    console.log("[AC-F2-4] balance=", dto.balanceMinor, "spent=", b.spentMinor, "chart=", JSON.stringify(dto.spending.byDay.map((d) => d.amountMinor)));
    expect(b.spentMinor).toBe(0);
    expect(dto.spending.totalOutMinor).toBe(0);
    expect(dto.balanceMinor).toBe(0);
    expect(dto.spending.byDay.every((d) => d.amountMinor === 0)).toBe(true);
    /* Transfers must still surface in the activity feed (AC-F2-4 second half). */
    expect(dto.recentActivity).toHaveLength(4);
    expect(dto.recentActivity.every((r) => r.transferGroupId !== null)).toBe(true);
  });

  it("AC-F2-9 caps progress at 100 and hides deleted goals", async () => {
    const { userId, householdId } = await makeOwnerHouse();
    await prisma.savingsGoal.createMany({
      data: [
        { householdId, createdByUserId: userId, name: "Normal", targetAmountMinor: 1_000_000, savedAmountMinor: 250_000 },
        { householdId, createdByUserId: userId, name: "Over", targetAmountMinor: 500_000, savedAmountMinor: 2_000_000 },
        { householdId, createdByUserId: userId, name: "Hapus", targetAmountMinor: 1_000_000, savedAmountMinor: 100_000, deletedAt: new Date() },
      ],
    });
    const { dashboard } = services(prisma);
    const dto = await dashboard.get(householdId, { periodDays: 7, now: NOW });
    const byName = Object.fromEntries(dto.goals.map((g) => [g.name, g.progressPercent]));
    console.log("[AC-F2-9] goals =", JSON.stringify(dto.goals.map((g) => ({ name: g.name, p: g.progressPercent }))));
    expect(dto.goals).toHaveLength(2);
    expect(byName.Normal).toBe(25);
    expect(byName.Over).toBe(100);
    expect(dto.goals.find((g) => g.name === "Hapus")).toBeUndefined();
  });

  it("AC-F2-1 cross-household isolation: A never sees B's balance, budget, or activity", async () => {
    const a = await makeOwnerHouse();
    const b = await makeOwnerHouse();
    await tx(a.householdId, a.userId, { type: "MONEY_IN", amountMinor: 1_000_000 });
    await tx(b.householdId, b.userId, { type: "MONEY_OUT", amountMinor: 9_999_999 });
    await prisma.householdBudget.create({ data: { householdId: a.householdId, periodStart: new Date("2026-10-01T00:00:00Z"), amountMinor: 2_000_000, createdByUserId: a.userId } });

    const { dashboard } = services(prisma);
    const dtoA = await dashboard.get(a.householdId, { periodDays: 30, now: NOW });
    const dtoB = await dashboard.get(b.householdId, { periodDays: 30, now: NOW });
    console.log("[isolation] A.balance=", dtoA.balanceMinor, "B.balance=", dtoB.balanceMinor, "A.spent=", dtoA.spending.totalOutMinor);
    expect(dtoA.balanceMinor).toBe(1_000_000);
    expect(dtoA.spending.totalOutMinor).toBe(0);
    expect(dtoA.recentActivity.every((r) => r.householdId === undefined)).toBe(true);
    expect(dtoA.recentActivity).toHaveLength(1);
    expect(dtoB.balanceMinor).toBe(-9_999_999);
    expect(dtoB.monthlyBudget.isSet).toBe(false);
  });

  it("AC-F2-6 keyset pagination has no duplicate or missing rows even when occurred_at ties", async () => {
    const { userId, householdId } = await makeOwnerHouse();
    const expected = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const row = await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 1_000 + i, occurredAt: new Date("2026-10-14T05:00:00Z") });
      expected.add(row.id);
    }
    const { repos } = services(prisma);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await repos.transaction.listActive(householdId, { limit: 10, cursor });
      seen.push(...page.rows.map((r) => r.id));
      cursor = page.nextCursor;
      pages += 1;
      if (pages > 10) throw new Error("pagination did not terminate");
    } while (cursor);
    console.log("[AC-F2-6] pages=", pages, "seen=", seen.length, "unique=", new Set(seen).size);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(new Set(seen)).toEqual(expected);
  });

  it("AC-F2-6 list filters (type/source/from/to) narrow rows; limit>50 is rejected with 422", async () => {
    const { userId, householdId } = await makeOwnerHouse();
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: 10_000, occurredAt: new Date("2026-10-10T05:00:00Z"), source: "MANUAL" });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 20_000, occurredAt: new Date("2026-10-12T05:00:00Z"), source: "OCR" });
    await tx(householdId, userId, { type: "MONEY_OUT", amountMinor: 30_000, occurredAt: new Date("2026-10-14T05:00:00Z"), source: "MANUAL" });

    const { repos } = services(prisma);
    const byType = await repos.transaction.listActive(householdId, { type: "MONEY_OUT" });
    const bySource = await repos.transaction.listActive(householdId, { source: "OCR" });
    const byRange = await repos.transaction.listActive(householdId, {
      from: new Date("2026-10-11T17:00:00Z"),
      to: new Date("2026-10-14T16:59:59.999Z"),
    });
    console.log("[AC-F2-6] type=", byType.rows.length, "source=", bySource.rows.length, "range=", byRange.rows.length);
    expect(byType.rows).toHaveLength(2);
    expect(bySource.rows).toHaveLength(1);
    expect(byRange.rows).toHaveLength(2);

    expect(() => parseListTransactionsQuery(new URLSearchParams("limit=51"))).toThrow(AppError);
    try {
      parseListTransactionsQuery(new URLSearchParams("limit=51"));
    } catch (error) {
      expect((error as AppError).statusCode).toBe(422);
      console.log("[AC-F2-6] limit=51 ->", (error as AppError).statusCode);
    }
    const ok = parseListTransactionsQuery(new URLSearchParams(""));
    /* Contract applies the default limit of 20 when the query omits it. */
    expect(ok.limit).toBe(20);
  });

  it("edge: aggregate totals above int32 stay exact (D-23, bigint aggregate)", async () => {
    const { userId, householdId } = await makeOwnerHouse();
    const max = 2_147_483_647;
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: max });
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: max });
    await tx(householdId, userId, { type: "MONEY_IN", amountMinor: max });
    const { dashboard } = services(prisma);
    const dto = await dashboard.get(householdId, { periodDays: 7, now: NOW });
    const raw = await prisma.$queryRaw<Array<{ s: bigint | null }>>`
      SELECT SUM(amount_minor) AS s FROM "transaction"
      WHERE household_id = CAST(${householdId} AS uuid) AND deleted_at IS NULL AND type = 'MONEY_IN'
    `;
    console.log("[int32] dto.balance=", dto.balanceMinor, "raw=", raw[0]?.s?.toString());
    expect(dto.balanceMinor).toBe(6_442_450_941);
    expect(dto.balanceMinor).toBe(Number(raw[0]?.s ?? 0));
    expect(Number.isSafeInteger(dto.balanceMinor)).toBe(true);
  });
});
