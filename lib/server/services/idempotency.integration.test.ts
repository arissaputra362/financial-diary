/*
  BUG-002 regression lock (AC-F3-8, AC-F3-6/A-11), DB-backed.

  Unit tests use the in-memory fake repository, which has no PostgreSQL
  transaction semantics, so the 25P02 abort was invisible (187 green). These
  tests run the real services through a real interactive transaction so a
  duplicate-key claim must survive and replay/409 must work.
*/

import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { CreateTransactionRequest } from "../contracts/transactions";
import { jakartaDateOnly } from "../jakarta";
import { createLedgerRepositories, type LedgerRepositories } from "../repositories/ledger";
import { createFakeBlobStore, createFakeOcrProvider } from "../testing/fakes";
import {
  cleanupIntegrationFixtures,
  createIntegrationLedgerTransaction,
  createIntegrationPrisma,
  seedIntegrationFixtures,
  type IntegrationFixtures,
} from "../testing/integration-db";
import { IdempotencyService } from "./idempotency";
import { OcrService } from "./ocr";
import { TransactionService } from "./transaction";

describe("Idempotency DB integration (BUG-002)", () => {
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

  const actor = () => ({ userId: fixtures.userId, householdId: fixtures.householdId });

  /** Real repositories over `prisma` + a real interactive-transaction runner. */
  function makeLedger(): {
    repos: LedgerRepositories;
    transaction: ReturnType<typeof createIntegrationLedgerTransaction>;
    idempotency: IdempotencyService;
    transactions: TransactionService;
    ocr: OcrService;
  } {
    const repos = createLedgerRepositories(prisma);
    const transaction = createIntegrationLedgerTransaction(prisma);
    const idempotency = new IdempotencyService(transaction);
    return {
      repos,
      transaction,
      idempotency,
      transactions: new TransactionService(repos, transaction, idempotency),
      ocr: new OcrService(
        repos,
        transaction,
        idempotency,
        createFakeOcrProvider(new Error("provider must not be called on the dedup path")),
        createFakeBlobStore().store,
      ),
    };
  }

  it("replays a 201 identically for the same key + same payload (AC-F3-8)", async () => {
    const { transactions, repos } = makeLedger();
    const input: CreateTransactionRequest = {
      type: "MONEY_OUT",
      amountMinor: 12_345,
      category: "food",
      occurredAt: jakartaDateOnly(),
      merchant: "Idem IT",
      /* T-009 (AC-F6-4): a manual row must be bound to a wallet. */
      walletId: fixtures.walletId,
    };
    const key = `it-${randomUUID()}`;

    const first = await transactions.createManual(actor(), input, key);
    const second = await transactions.createManual(actor(), input, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await prisma.transaction.count({ where: { householdId: fixtures.householdId } })).toBe(1);

    /* The replay persisted no second row: the wallet balance is charged once. */
    const balances = await repos.wallet.balances(fixtures.householdId);
    expect(balances.find((row) => row.walletId === fixtures.walletId)?.balanceMinor).toBe(-12_345);
    expect(balances.find((row) => row.walletId === fixtures.walletId)?.transactionCount).toBe(1);
  });

  it("returns 409 IDEMPOTENCY_CONFLICT for the same key + a different payload (AC-F3-8)", async () => {
    const { transactions, repos } = makeLedger();
    const base: CreateTransactionRequest = {
      type: "MONEY_OUT",
      amountMinor: 1_000,
      category: "food",
      occurredAt: jakartaDateOnly(),
      walletId: fixtures.walletId,
    };
    const key = `it-${randomUUID()}`;

    await transactions.createManual(actor(), base, key);
    await expect(
      transactions.createManual(actor(), { ...base, amountMinor: 2_000 }, key),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", statusCode: 409 });
    expect(await prisma.transaction.count({ where: { householdId: fixtures.householdId } })).toBe(1);

    /* Conflicting payload never touched the ledger: only the first amount counts. */
    const balances = await repos.wallet.balances(fixtures.householdId);
    expect(balances.find((row) => row.walletId === fixtures.walletId)?.balanceMinor).toBe(-1_000);
  });

  it("replays a stored 409 DUPLICATE_RECEIPT for a same-key retry (AC-F3-6/A-11)", async () => {
    const { ocr } = makeLedger();
    const bytes = new TextEncoder().encode(`receipt-${randomUUID()}`);
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    await prisma.receipt.create({
      data: {
        householdId: fixtures.householdId,
        uploadedByUserId: fixtures.userId,
        contentSha256,
        mimeType: "image/png",
        sizeBytes: bytes.byteLength,
        storageKey: `receipts/${fixtures.householdId}/${contentSha256}`,
      },
    });
    const file = { bytes, mimeType: "image/png", sizeBytes: bytes.byteLength };
    const key = `it-${randomUUID()}`;

    const first = await ocr.upload(actor(), file, key);
    expect(first.status).toBe(409);
    expect((first.body as { error: { code: string } }).error.code).toBe("DUPLICATE_RECEIPT");

    const second = await ocr.upload(actor(), file, key);
    expect(second.status).toBe(409);
    expect(second.body).toEqual(first.body);
  });

  it("treats the same key used on another route as IDEMPOTENCY_CONFLICT (method+path hashed, per-user scope)", async () => {
    const { transactions, ocr, repos } = makeLedger();
    const input: CreateTransactionRequest = {
      type: "MONEY_OUT",
      amountMinor: 4_321,
      category: "food",
      occurredAt: jakartaDateOnly(),
      merchant: "Route A",
      walletId: fixtures.walletId,
    };
    const key = `it-${randomUUID()}`;

    const first = await transactions.createManual(actor(), input, key);
    expect(first.status).toBe(201);

    const bytes = new TextEncoder().encode(`receipt-${randomUUID()}`);
    const file = { bytes, mimeType: "image/png", sizeBytes: bytes.byteLength };
    await expect(ocr.upload(actor(), file, key)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      statusCode: 409,
    });
    /* The second route's mutation never ran: no receipt was persisted. */
    expect(await prisma.receipt.count({ where: { householdId: fixtures.householdId } })).toBe(0);

    /* The claimed key still maps to the committed transaction only. */
    const balances = await repos.wallet.balances(fixtures.householdId);
    expect(balances.find((row) => row.walletId === fixtures.walletId)?.balanceMinor).toBe(-4_321);
  });

  it("scopes the claim per user, so the same key for another user is a fresh claim (A-22)", async () => {
    const { idempotency } = makeLedger();
    const other = await prisma.user.create({
      data: {
        email: `qa-t008-dev-${randomUUID()}@test.local`,
        passwordHash: "not-a-real-hash",
        displayName: "Idem Other",
      },
    });
    try {
      const key = `it-${randomUUID()}`;
      const first = await idempotency.run(fixtures.userId, key, "hash-per-user", async () => ({
        status: 201,
        body: { who: "a" },
      }));
      const second = await idempotency.run(other.id, key, "hash-per-user", async () => ({
        status: 201,
        body: { who: "b" },
      }));
      expect(first).toEqual({ status: 201, body: { who: "a" } });
      expect(second).toEqual({ status: 201, body: { who: "b" } });
    } finally {
      await prisma.idempotencyKey.deleteMany({ where: { userId: other.id } });
      await prisma.user.deleteMany({ where: { id: other.id } });
    }
  });

  it("rolls the claimed key back when the mutation throws, so a retry runs fresh (AC-F3-8)", async () => {
    const { idempotency } = makeLedger();
    const key = `it-${randomUUID()}`;
    const hash = createHash("sha256").update(key).digest("hex");

    await expect(
      idempotency.run(fixtures.userId, key, hash, async () => {
        throw new Error("mutation failed");
      }),
    ).rejects.toThrow("mutation failed");

    const retry = await idempotency.run(fixtures.userId, key, hash, async () => ({
      status: 201,
      body: { ok: true },
    }));
    expect(retry).toEqual({ status: 201, body: { ok: true } });
  });
});
