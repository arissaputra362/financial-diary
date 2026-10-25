/*
  DB integration coverage for the monthly report aggregate (AC-F7-4/8/9/11/12).
  The unit route tests use an in-memory mirror; this suite exercises the real
  SQL CTEs (scope, archived wallets, transfer legs, new-wallet opening,
  backdated rows, soft delete, and the Asia/Jakarta daily series).
*/

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createReportRepository, type ReportRepository } from "../repositories/reports";
import type { WalletActor } from "../repositories/ledger";
import { PeriodService } from "../services/period";
import {
  cleanupIntegrationFixtures,
  createIntegrationPrisma,
  seedIntegrationFixtures,
  type IntegrationFixtures,
} from "../testing/integration-db";

const MONTH = "2026-03";

function at(month: string, day: number): Date {
  /* Noon Jakarta keeps each row unambiguously inside its local calendar day. */
  return new Date(`${month}-${String(day).padStart(2, "0")}T12:00:00+07:00`);
}

describe("report repository aggregate (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let fixtures: IntegrationFixtures;
  let repo: ReportRepository;
  let actor: WalletActor;
  let mainWallet: string;
  let secondWallet: string;
  let archivedWallet: string;
  let personalWallet: string;
  let newWallet: string;
  let futureWallet: string;

  async function createWallet(input: {
    name: string;
    openingBalanceMinor: number;
    scope?: "SHARING" | "PERSONAL";
    createdAt: Date;
    archivedAt?: Date;
  }): Promise<string> {
    const row = await prisma.wallet.create({
      data: {
        householdId: fixtures.householdId,
        createdByUserId: fixtures.userId,
        scope: input.scope ?? "SHARING",
        name: input.name,
        openingBalanceMinor: input.openingBalanceMinor,
        createdAt: input.createdAt,
        archivedAt: input.archivedAt ?? null,
        archivedByUserId: input.archivedAt ? fixtures.userId : null,
      },
    });
    return row.id;
  }

  async function createTransaction(input: {
    walletId: string;
    type: "MONEY_IN" | "MONEY_OUT";
    amountMinor: number;
    occurredAt: Date;
    category?: string | null;
    transferGroupId?: string;
    deletedAt?: Date;
  }): Promise<void> {
    await prisma.transaction.create({
      data: {
        householdId: fixtures.householdId,
        createdByUserId: fixtures.userId,
        walletId: input.walletId,
        type: input.type,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        source: "MANUAL",
        category: input.category ?? null,
        transferGroupId: input.transferGroupId ?? null,
        deletedAt: input.deletedAt ?? null,
        deletedByUserId: input.deletedAt ? fixtures.userId : null,
      },
    });
  }

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    fixtures = await seedIntegrationFixtures(prisma);
    repo = createReportRepository(prisma);
    actor = { userId: fixtures.userId, householdId: fixtures.householdId, role: "OWNER" };

    mainWallet = fixtures.walletId;
    await prisma.wallet.update({
      where: { id: mainWallet },
      data: { openingBalanceMinor: 1_000_000, createdAt: at("2026-01", 1) },
    });
    secondWallet = await createWallet({
      name: "Dompet Belanja",
      openingBalanceMinor: 0,
      createdAt: at("2026-01", 1),
    });
    archivedWallet = await createWallet({
      name: "Kas Lama",
      openingBalanceMinor: 50_000,
      createdAt: at("2026-01", 2),
      archivedAt: at("2026-02", 1),
    });
    personalWallet = await createWallet({
      name: "Dompet Pribadi",
      openingBalanceMinor: 500_000,
      scope: "PERSONAL",
      createdAt: at("2026-01", 3),
    });
    const newWalletId = await createWallet({
      name: "Dompet Baru",
      openingBalanceMinor: 200_000,
      createdAt: at("2026-03", 5),
    });
    const futureWalletId = await createWallet({
      name: "Dompet Backdate",
      openingBalanceMinor: 25_000,
      createdAt: at("2026-04", 10),
    });
    newWallet = newWalletId;
    futureWallet = futureWalletId;

    await createTransaction({
      walletId: mainWallet,
      type: "MONEY_IN",
      amountMinor: 100_000,
      occurredAt: at("2026-02", 20),
    });
    await createTransaction({
      walletId: mainWallet,
      type: "MONEY_IN",
      amountMinor: 300_000,
      occurredAt: at("2026-03", 3),
      category: "Gaji",
    });
    await createTransaction({
      walletId: mainWallet,
      type: "MONEY_OUT",
      amountMinor: 50_000,
      occurredAt: at("2026-03", 4),
      category: "Makan",
    });
    await createTransaction({
      walletId: mainWallet,
      type: "MONEY_OUT",
      amountMinor: 20_000,
      occurredAt: at("2026-03", 5),
    });

    const transferGroupId = randomUUID();
    await createTransaction({
      walletId: mainWallet,
      type: "MONEY_OUT",
      amountMinor: 70_000,
      occurredAt: at("2026-03", 6),
      transferGroupId,
    });
    await createTransaction({
      walletId: secondWallet,
      type: "MONEY_IN",
      amountMinor: 70_000,
      occurredAt: at("2026-03", 6),
      transferGroupId,
    });

    /* New wallet with a transaction dated before the wallet was created. */
    await createTransaction({
      walletId: newWallet,
      type: "MONEY_IN",
      amountMinor: 40_000,
      occurredAt: at("2026-03", 2),
      category: "Bonus",
    });
    /* Created after the period but active inside it: must still count. */
    await createTransaction({
      walletId: futureWallet,
      type: "MONEY_IN",
      amountMinor: 15_000,
      occurredAt: at("2026-03", 15),
      category: "Bonus",
    });
    await createTransaction({
      walletId: archivedWallet,
      type: "MONEY_OUT",
      amountMinor: 10_000,
      occurredAt: at("2026-03", 8),
      category: "Lain",
    });
    await createTransaction({
      walletId: personalWallet,
      type: "MONEY_IN",
      amountMinor: 500_000,
      occurredAt: at("2026-03", 9),
    });
    await createTransaction({
      walletId: mainWallet,
      type: "MONEY_OUT",
      amountMinor: 999_000,
      occurredAt: at("2026-03", 10),
      deletedAt: at("2026-03", 11),
    });
  }, 30_000);

  afterAll(async () => {
    if (!prisma || !fixtures) return;
    await cleanupIntegrationFixtures(prisma, fixtures);
    await prisma.$disconnect();
  }, 30_000);

  it("aggregates shared wallets, transfers, new wallets, and backdates", async () => {
    const periods = new PeriodService();
    const aggregate = await repo.aggregate(actor, {
      scope: "SHARING",
      period: periods.month(MONTH),
      previous: periods.month("2026-02"),
    });

    expect(aggregate.openingMinor).toBe(1_150_000);
    expect(aggregate.newWalletOpeningMinor).toBe(225_000);
    expect(aggregate.moneyInMinor).toBe(355_000);
    expect(aggregate.moneyOutMinor).toBe(80_000);
    expect(aggregate.transferInMinor).toBe(70_000);
    expect(aggregate.transferOutMinor).toBe(70_000);
    expect(aggregate.transactionCount).toBe(8);
    expect(aggregate.hasBackdatedNewWallet).toBe(true);

    const closing =
      aggregate.openingMinor +
      aggregate.newWalletOpeningMinor +
      aggregate.moneyInMinor -
      aggregate.moneyOutMinor +
      aggregate.transferInMinor -
      aggregate.transferOutMinor;
    expect(closing).toBe(1_650_000);

    expect(aggregate.previous).toEqual({
      hasData: true,
      closingMinor: 1_150_000,
      moneyInMinor: 100_000,
      moneyOutMinor: 0,
    });

    expect(aggregate.dailyBalances).toHaveLength(31);
    expect(aggregate.dailyBalances[0]).toEqual({
      date: "2026-03-01",
      closingMinor: 1_375_000,
    });
    expect(aggregate.dailyBalances[1]).toEqual({
      date: "2026-03-02",
      closingMinor: 1_415_000,
    });
    expect(aggregate.dailyBalances[30]?.closingMinor).toBe(closing);

    const categories = aggregate.categories
      .map((row) => `${row.type}:${row.category ?? "null"}:${row.amountMinor}`)
      .sort();
    expect(categories).toEqual([
      "MONEY_IN:Bonus:55000",
      "MONEY_IN:Gaji:300000",
      "MONEY_OUT:Lain:10000",
      "MONEY_OUT:Makan:50000",
      "MONEY_OUT:null:20000",
    ]);
  });

  it("keeps Bersama and Pribadi in separate wallet sets", async () => {
    const periods = new PeriodService();
    const personal = await repo.aggregate(actor, {
      scope: "PERSONAL",
      period: periods.month(MONTH),
      previous: periods.month("2026-02"),
    });

    expect(personal.openingMinor).toBe(500_000);
    expect(personal.moneyInMinor).toBe(500_000);
    expect(personal.moneyOutMinor).toBe(0);
    expect(personal.previous.hasData).toBe(false);
  });

  it("narrows every figure to one archived wallet", async () => {
    const periods = new PeriodService();
    const aggregate = await repo.aggregate(actor, {
      scope: "SHARING",
      walletId: archivedWallet,
      period: periods.month(MONTH),
      previous: periods.month("2026-02"),
    });

    expect(aggregate.openingMinor).toBe(50_000);
    expect(aggregate.moneyInMinor).toBe(0);
    expect(aggregate.moneyOutMinor).toBe(10_000);
    expect(aggregate.transactionCount).toBe(1);
    expect(aggregate.dailyBalances[30]?.closingMinor).toBe(40_000);
  });

  it("lists scope wallets including archived ones, never another member's personal wallet", async () => {
    const shared = await repo.listScopedWallets(actor, "SHARING");
    expect(shared.map((wallet) => wallet.id).sort()).toEqual(
      [mainWallet, secondWallet, archivedWallet, newWallet, futureWallet].sort(),
    );

    const personal = await repo.listScopedWallets(actor, "PERSONAL");
    expect(personal.map((wallet) => wallet.id)).toEqual([personalWallet]);
  });
});
