/*
  BUG-001 regression test (AC-F3-3), DB-backed.

  The unit suite passes because the fake repository never enforces the migration
  CHECK, so it cannot catch this class of bug. Against real PostgreSQL the
  transfer create persists `MONEY_OUT`/`MONEY_IN` rows sharing one
  `transfer_group_id`, which the init migration's
  `CHECK ((type = 'TRANSFER') = (transfer_group_id IS NOT NULL))` rejected with
  SQLSTATE 23514 (BUG-001). Migration `20261006120000_fix_transfer_enum` drops
  that constraint and removes the unused `TRANSFER` enum value, so this now
  passes; the test guards against the constraint/regression coming back.

  T-009 (F6) note: every transaction row now carries a `walletId` (AC-F6-4/
  AC-F6-5), so the fixtures seed two wallets and each assertion checks the
  per-wallet balance oracle, not only the row shape.
*/

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { jakartaDateOnly } from "../jakarta";
import { createLedgerRepositories } from "../repositories/ledger";
import {
  cleanupIntegrationFixtures,
  createIntegrationLedgerTransaction,
  createIntegrationPrisma,
  seedIntegrationFixtures,
  type IntegrationFixtures,
} from "../testing/integration-db";
import { IdempotencyService } from "./idempotency";
import { TransactionService } from "./transaction";

describe("Transfer DB integration (BUG-001, pending PM)", () => {
  let prisma: PrismaClient;
  let fixtures: IntegrationFixtures;
  /** Second wallet of the same household, so a transfer pair has a valid target. */
  let savingsWalletId: string;

  beforeAll(() => {
    prisma = createIntegrationPrisma();
  });

  beforeEach(async () => {
    fixtures = await seedIntegrationFixtures(prisma);
    const savings = await prisma.wallet.create({
      data: {
        householdId: fixtures.householdId,
        createdByUserId: fixtures.userId,
        scope: "SHARING",
        name: "Dompet Tabungan IT",
        purpose: "Regression fixture",
        openingBalanceMinor: 500_000,
      },
    });
    savingsWalletId = savings.id;
  });

  afterEach(async () => {
    await cleanupIntegrationFixtures(prisma, fixtures);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a TRANSFER as two legs sharing one transfer_group_id (AC-F3-3)", async () => {
    const repos = createLedgerRepositories(prisma);
    const transaction = createIntegrationLedgerTransaction(prisma);
    const service = new TransactionService(repos, transaction, new IdempotencyService(transaction));
    const actor = { userId: fixtures.userId, householdId: fixtures.householdId };

    const result = await service.createManual(actor, {
      type: "TRANSFER",
      amountMinor: 300_000,
      occurredAt: jakartaDateOnly(),
      fromWalletId: fixtures.walletId,
      toWalletId: savingsWalletId,
    });

    expect(result.status).toBe(201);
    const rows = await prisma.transaction.findMany({
      where: { householdId: fixtures.householdId },
      orderBy: { type: "asc" },
    });
    expect(rows).toHaveLength(2);
    const out = rows.find((row) => row.type === "MONEY_OUT");
    const inn = rows.find((row) => row.type === "MONEY_IN");
    expect(out).toBeDefined();
    expect(inn).toBeDefined();
    expect(out?.transferGroupId).not.toBeNull();
    expect(out?.transferGroupId).toBe(inn?.transferGroupId);

    /* AC-F6-5: each leg is bound to its own wallet (never null, never shared). */
    expect(out?.walletId).toBe(fixtures.walletId);
    expect(inn?.walletId).toBe(savingsWalletId);
    expect(out?.walletId).not.toBe(inn?.walletId);
  });

  it("moves balance between the two wallets only (AC-F6-5 balance oracle)", async () => {
    const repos = createLedgerRepositories(prisma);
    const transaction = createIntegrationLedgerTransaction(prisma);
    const service = new TransactionService(repos, transaction, new IdempotencyService(transaction));
    const actor = { userId: fixtures.userId, householdId: fixtures.householdId };

    await service.createManual(actor, {
      type: "TRANSFER",
      amountMinor: 300_000,
      occurredAt: jakartaDateOnly(),
      fromWalletId: fixtures.walletId,
      toWalletId: savingsWalletId,
    });

    const balances = await repos.wallet.balances(fixtures.householdId);
    const source = balances.find((row) => row.walletId === fixtures.walletId);
    const target = balances.find((row) => row.walletId === savingsWalletId);
    expect(source?.balanceMinor).toBe(-300_000);
    expect(target?.balanceMinor).toBe(800_000);
    expect(source?.transactionCount).toBe(1);
    expect(target?.transactionCount).toBe(1);

    /* Trashed-ness of one leg must not change the balance: only one pair exists. */
    expect(await prisma.transaction.count({ where: { householdId: fixtures.householdId } })).toBe(2);
  });

  it("keeps the opening balance out of reach after the first transfer leg (A-42)", async () => {
    const repos = createLedgerRepositories(prisma);
    const transaction = createIntegrationLedgerTransaction(prisma);
    const service = new TransactionService(repos, transaction, new IdempotencyService(transaction));
    const actor = { userId: fixtures.userId, householdId: fixtures.householdId };

    await service.createManual(actor, {
      type: "TRANSFER",
      amountMinor: 100_000,
      occurredAt: jakartaDateOnly(),
      fromWalletId: fixtures.walletId,
      toWalletId: savingsWalletId,
    });

    /* A single transfer leg already counts as a transaction (A-42/C-21). */
    const balances = await repos.wallet.balances(fixtures.householdId);
    for (const row of balances) expect(row.transactionCount).toBeGreaterThanOrEqual(1);
    expect(balances).toHaveLength(2);
  });

  it("rejects a same-wallet pair with 422 VALIDATION_ERROR fieldErrors.toWalletId (A-51)", async () => {
    const repos = createLedgerRepositories(prisma);
    const transaction = createIntegrationLedgerTransaction(prisma);
    const service = new TransactionService(repos, transaction, new IdempotencyService(transaction));
    const actor = { userId: fixtures.userId, householdId: fixtures.householdId };

    await expect(
      service.createManual(actor, {
        type: "TRANSFER",
        amountMinor: 25_000,
        occurredAt: jakartaDateOnly(),
        fromWalletId: fixtures.walletId,
        toWalletId: fixtures.walletId,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR",
      fieldErrors: { toWalletId: ["Dompet asal dan tujuan harus berbeda."] },
    });

    /* Nothing was persisted for the rejected pair. */
    expect(await prisma.transaction.count({ where: { householdId: fixtures.householdId } })).toBe(0);
  });
});
