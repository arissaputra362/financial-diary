/*
  T-005 DB integration suite (AC-F2-1, AC-F2-4, AC-F2-5).

  The critical pre-requisite: `sumByType` and `listByDay` must exclude transfer
  legs, otherwise a transfer counts as spending. These run against real
  PostgreSQL so the aggregate WHERE clauses (transfer_group_id IS NULL) and the
  Asia/Jakarta date filtering are exercised exactly as production would.
*/

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  createBudgetRepository,
  createGoalRepository,
  createLedgerRepositories,
  createPersonalBudgetRepository,
} from "../repositories/ledger";
import { BudgetService } from "./budget";
import { DashboardService } from "./dashboard";
import { PeriodService } from "./period";
import {
  cleanupIntegrationFixtures,
  createIntegrationPrisma,
  seedIntegrationFixtures,
  type IntegrationFixtures,
} from "../testing/integration-db";

const NOW = new Date("2026-10-15T05:00:00Z"); // 15 Oct 2026 12:00 WIB (fixed)
const RANGE_END = new Date("2026-10-15T16:59:59.999Z"); // 15 Oct 23:59:59 WIB

function buildServices(prisma: PrismaClient) {
  const repos = createLedgerRepositories(prisma);
  const periods = new PeriodService();
  const budget = new BudgetService(
    createBudgetRepository(prisma),
    createPersonalBudgetRepository(prisma),
    repos.transaction,
    periods,
  );
  const dashboard = new DashboardService(
    { transaction: repos.transaction, wallet: repos.wallet },
    createGoalRepository(prisma),
    budget,
    periods,
  );
  return { repos, dashboard, budget };
}

async function insertTransaction(
  prisma: PrismaClient,
  fixtures: IntegrationFixtures,
  data: {
    type: "MONEY_IN" | "MONEY_OUT";
    amountMinor: number;
    occurredAt: Date;
    transferGroupId?: string | null;
    walletId?: string;
  },
): Promise<void> {
  await prisma.transaction.create({
    data: {
      householdId: fixtures.householdId,
      createdByUserId: fixtures.userId,
      type: data.type,
      amountMinor: data.amountMinor,
      occurredAt: data.occurredAt,
      source: "MANUAL",
      transferGroupId: data.transferGroupId ?? null,
      walletId: data.walletId ?? fixtures.walletId,
    },
  });
}

async function createPersonalWallet(
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  options: { archived?: boolean } = {},
): Promise<string> {
  const row = await prisma.wallet.create({
    data: {
      householdId,
      createdByUserId: userId,
      scope: "PERSONAL",
      name: `Pribadi ${crypto.randomUUID()}`,
      openingBalanceMinor: 0,
      ...(options.archived ? { archivedAt: new Date("2026-09-30T00:00:00Z") } : {}),
    },
  });
  return row.id;
}

describe("Dashboard DB integration (T-005)", () => {
  let prisma: PrismaClient;
  let fixtures: IntegrationFixtures;

  beforeAll(() => {
    prisma = createIntegrationPrisma();
  });

  beforeEach(async () => {
    fixtures = await seedIntegrationFixtures(prisma);
  });

  afterEach(async () => {
    await cleanupIntegrationFixtures(prisma, fixtures);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps spentMinor = 0 when the household only has transfers (AC-F2-4)", async () => {
    const transferGroupId = crypto.randomUUID();
    await insertTransaction(prisma, fixtures, { type: "MONEY_OUT", amountMinor: 300_000, occurredAt: NOW, transferGroupId });
    await insertTransaction(prisma, fixtures, { type: "MONEY_IN", amountMinor: 300_000, occurredAt: NOW, transferGroupId });

    const { repos, dashboard, budget } = buildServices(prisma);

    await expect(
      repos.transaction.sumByType(fixtures.householdId, { type: "MONEY_OUT", from: new Date(0), to: RANGE_END }),
    ).resolves.toBe(0);
    await expect(
      repos.transaction.listByDay(fixtures.householdId, { from: new Date(0), to: RANGE_END }),
    ).resolves.toEqual([]);

    const budgetDto = await budget.get(fixtures.householdId, NOW);
    expect(budgetDto.spentMinor).toBe(0);

    const dto = await dashboard.get({ userId: fixtures.userId, householdId: fixtures.householdId, role: "OWNER" }, { periodDays: 30, now: NOW });
    expect(dto.spending.totalOutMinor).toBe(0);
    expect(dto.sharedBalanceMinor).toBe(0);
  });

  it("buckets a 2026-09-30T17:30:00Z expense into the 1 Oct WIB bucket (AC-F2-5)", async () => {
    await insertTransaction(prisma, fixtures, {
      type: "MONEY_OUT",
      amountMinor: 50_000,
      occurredAt: new Date("2026-09-30T17:30:00Z"),
    });
    const { dashboard } = buildServices(prisma);
    const dto = await dashboard.get({ userId: fixtures.userId, householdId: fixtures.householdId, role: "OWNER" }, { periodDays: 30, now: NOW });
    const bucket = dto.spending.byDay.find((day) => day.date === "2026-10-01");
    expect(bucket?.amountMinor).toBe(50_000);
    /* The previous UTC day must stay empty in the Jakarta calendar. */
    expect(dto.spending.byDay.find((day) => day.date === "2026-09-30")?.amountMinor).toBe(0);
  });

  it("computes balance/budget from active rows only and isolates households (AC-F2-1)", async () => {
    const other = await seedIntegrationFixtures(prisma);
    try {
      await insertTransaction(prisma, fixtures, { type: "MONEY_IN", amountMinor: 1_000_000, occurredAt: NOW });
      await insertTransaction(prisma, fixtures, { type: "MONEY_OUT", amountMinor: 250_000, occurredAt: NOW });
      await insertTransaction(prisma, other, { type: "MONEY_OUT", amountMinor: 9_999_999, occurredAt: NOW });

      const { dashboard } = buildServices(prisma);
      const dto = await dashboard.get({ userId: fixtures.userId, householdId: fixtures.householdId, role: "OWNER" }, { periodDays: 30, now: NOW });
      expect(dto.sharedBalanceMinor).toBe(750_000);
      expect(dto.spending.totalOutMinor).toBe(250_000);
    } finally {
      await cleanupIntegrationFixtures(prisma, other);
    }
  });

  it("enforces one personal budget row per user per month (T-015)", async () => {
    const actor = { userId: fixtures.userId, role: "OWNER", householdId: fixtures.householdId };
    const { budget } = buildServices(prisma);

    await budget.upsert(actor, fixtures.householdId, 100_000, "PERSONAL", NOW);
    await budget.upsert(actor, fixtures.householdId, 250_000, "PERSONAL", NOW);

    const rows = await prisma.personalBudget.findMany({
      where: { householdId: fixtures.householdId, userId: fixtures.userId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountMinor).toBe(250_000);

    await expect(
      prisma.personalBudget.create({
        data: {
          householdId: fixtures.householdId,
          userId: fixtures.userId,
          periodStart: new Date("2026-10-01T00:00:00Z"),
          amountMinor: 1,
          createdByUserId: fixtures.userId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("counts personal spent only from the actor's PERSONAL wallets, archived included, transfers excluded (T-015)", async () => {
    const member = await prisma.user.create({
      data: {
        email: `it-member-${crypto.randomUUID()}@test.local`,
        passwordHash: "not-a-real-hash",
        displayName: "Integration Member",
      },
    });
    try {
      const actorWallet = await createPersonalWallet(prisma, fixtures.householdId, fixtures.userId);
      const archivedWallet = await createPersonalWallet(prisma, fixtures.householdId, fixtures.userId, {
        archived: true,
      });
      const memberWallet = await createPersonalWallet(prisma, fixtures.householdId, member.id);
      const transferGroupId = crypto.randomUUID();

      await insertTransaction(prisma, fixtures, {
        type: "MONEY_OUT",
        amountMinor: 100_000,
        occurredAt: NOW,
        walletId: actorWallet,
      });
      await insertTransaction(prisma, fixtures, {
        type: "MONEY_OUT",
        amountMinor: 50_000,
        occurredAt: NOW,
        walletId: archivedWallet,
      });
      await insertTransaction(prisma, fixtures, {
        type: "MONEY_OUT",
        amountMinor: 900_000,
        occurredAt: NOW,
        walletId: memberWallet,
      });
      await insertTransaction(prisma, fixtures, {
        type: "MONEY_OUT",
        amountMinor: 300_000,
        occurredAt: NOW,
      });
      await insertTransaction(prisma, fixtures, {
        type: "MONEY_OUT",
        amountMinor: 500_000,
        occurredAt: NOW,
        walletId: actorWallet,
        transferGroupId,
      });
      await insertTransaction(prisma, fixtures, {
        type: "MONEY_IN",
        amountMinor: 500_000,
        occurredAt: NOW,
        transferGroupId,
      });

      const actor = { userId: fixtures.userId, role: "OWNER", householdId: fixtures.householdId };
      const { budget, dashboard } = buildServices(prisma);

      const personal = await budget.getPersonal(actor, NOW);
      expect(personal.scope).toBe("PERSONAL");
      expect(personal.spentMinor).toBe(150_000);

      const shared = await budget.get(fixtures.householdId, NOW);
      expect(shared.scope).toBe("SHARED");
      expect(shared.spentMinor).toBe(300_000);

      const dto = await dashboard.get(actor, { periodDays: 30, now: NOW });
      expect(dto.personalSpending.totalOutMinor).toBe(150_000);
      expect(dto.spending.totalOutMinor).toBe(300_000);
      expect(dto.personalMonthlyBudget.scope).toBe("PERSONAL");
      expect(dto.monthlyBudget.scope).toBe("SHARED");
    } finally {
      const memberWallets = await prisma.wallet.findMany({
        where: { createdByUserId: member.id },
        select: { id: true },
      });
      await prisma.transaction.deleteMany({
        where: { walletId: { in: memberWallets.map((wallet) => wallet.id) } },
      });
      await prisma.personalBudget.deleteMany({ where: { userId: member.id } });
      await prisma.wallet.deleteMany({ where: { createdByUserId: member.id } });
      await prisma.user.delete({ where: { id: member.id } });
    }
  });
});
