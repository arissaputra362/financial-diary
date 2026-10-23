import { beforeEach, describe, expect, it } from "vitest";
import { dateOnlyToNoonJakarta, jakartaDateOnly } from "../jakarta";
import { IdempotencyService } from "./idempotency";
import { TransactionService } from "./transaction";
import { createFakeLedger, createFakeStore, type FakeStore } from "../testing/fakes";
import type { LedgerRepositories } from "../repositories/ledger";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const RECEIPT = "44444444-4444-4444-8444-444444444444";
const WALLET = "66666666-6666-4666-8666-666666666666";
const WALLET_B = "77777777-7777-4777-8777-777777777777";
const actor = { userId: USER, householdId: HOUSEHOLD, role: "OWNER" };

const baseInput = {
  type: "MONEY_OUT" as const,
  amountMinor: 25_000,
  category: "food" as const,
  occurredAt: jakartaDateOnly(),
  walletId: WALLET,
};

function seedWallet(store: FakeStore, id: string): void {
  store.wallets.push({
    id,
    householdId: HOUSEHOLD,
    createdByUserId: USER,
    createdByDisplayName: "Ana",
    scope: "SHARING",
    name: `Dompet ${id.slice(0, 4)}`,
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
  });
}

function tomorrow(): string {
  return jakartaDateOnly(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function setup(): { service: TransactionService; repos: LedgerRepositories; store: FakeStore } {
  const store = createFakeStore();
  seedWallet(store, WALLET);
  seedWallet(store, WALLET_B);
  const { repos, transaction } = createFakeLedger(store);
  const service = new TransactionService(repos, transaction, new IdempotencyService(transaction));
  return { service, repos, store };
}

describe("TransactionService", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("rejects amount 0, negative, and above int32 max (AC-F3-1)", async () => {
    await expect(ctx.service.createManual(actor, { ...baseInput, amountMinor: 0 })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(ctx.service.createManual(actor, { ...baseInput, amountMinor: -5 })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(
      ctx.service.createManual(actor, { ...baseInput, amountMinor: 2_147_483_648 }),
    ).rejects.toMatchObject({ code: "AMOUNT_OUT_OF_RANGE", statusCode: 422 });
  });

  it("rejects occurred_at in the future on the Jakarta calendar (AC-F3-1)", async () => {
    await expect(
      ctx.service.createManual(actor, { ...baseInput, occurredAt: tomorrow() }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("enforces category per type (A-09)", async () => {
    await expect(
      ctx.service.createManual(actor, { ...baseInput, type: "MONEY_IN", category: "food" }),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      ctx.service.createManual(actor, { ...baseInput, type: "MONEY_OUT", category: "income" }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("stores integer minor with the Minor DTO suffix (AC-F3-2)", async () => {
    const result = await ctx.service.createManual(actor, baseInput);
    expect(result.status).toBe(201);
    const body = result.body as { transactions: Array<Record<string, unknown>> };
    expect(body.transactions[0]?.amountMinor).toBe(25_000);
    expect(body.transactions[0]).not.toHaveProperty("amount");
    expect(body.transactions[0]?.currencyCode).toBe("IDR");
  });

  it("creates exactly two transfer legs with one shared transfer_group_id (AC-F3-3)", async () => {
    const result = await ctx.service.createManual(actor, {
      type: "TRANSFER",
      amountMinor: 100_000,
      occurredAt: jakartaDateOnly(),
      fromWalletId: WALLET,
      toWalletId: WALLET_B,
    });
    expect(result.status).toBe(201);
    const body = result.body as { transactions: Array<{ id: string; type: string; transferGroupId: string | null }> };
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0]?.type).toBe("MONEY_OUT");
    expect(body.transactions[1]?.type).toBe("MONEY_IN");
    expect(body.transactions[0]?.transferGroupId).toBe(body.transactions[1]?.transferGroupId);
    expect(ctx.store.transactions).toHaveLength(2);
  });

  it("converts date-only D to occurred_at 12:00 Asia/Jakarta (AC-F3-4, D-14)", async () => {
    const result = await ctx.service.createManual(actor, baseInput);
    const row = ctx.store.transactions[0];
    expect(row?.occurredAt.getTime()).toBe(dateOnlyToNoonJakarta(baseInput.occurredAt).getTime());
    const body = result.body as { transactions: Array<{ occurredAt: string }> };
    expect(body.transactions[0]?.occurredAt).toBe(row?.occurredAt.toISOString());
  });

  it("creates an OCR-sourced transaction only with a household receipt (AC-F3-4)", async () => {
    ctx.store.receipts.push({
      id: RECEIPT,
      householdId: HOUSEHOLD,
      uploadedByUserId: USER,
      contentSha256: "a".repeat(64),
      mimeType: "image/jpeg",
      sizeBytes: 100,
      storageKey: "receipts/x",
    });
    const result = await ctx.service.createFromOcr(actor, {
      ...baseInput,
      source: "OCR",
      receiptId: RECEIPT,
    });
    const row = ctx.store.transactions[0];
    expect(row?.source).toBe("OCR");
    expect(row?.receiptId).toBe(RECEIPT);
    expect(result.status).toBe(201);

    await expect(
      ctx.service.createFromOcr(actor, { ...baseInput, source: "OCR", receiptId: "55555555-5555-4555-8555-555555555555" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects transfer from OCR (not supported in the MVP)", async () => {
    await expect(
      ctx.service.createFromOcr(actor, {
        type: "TRANSFER",
        amountMinor: 10_000,
        occurredAt: jakartaDateOnly(),
        source: "OCR",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("replays the committed response for the same idempotency key + payload (AC-F3-8)", async () => {
    const first = await ctx.service.createManual(actor, baseInput, "key-aaaaaaaa");
    const second = await ctx.service.createManual(actor, baseInput, "key-aaaaaaaa");
    expect(second).toEqual(first);
    expect(ctx.store.transactions).toHaveLength(1);
  });

  it("returns IDEMPOTENCY_CONFLICT for the same key with a different payload (AC-F3-8)", async () => {
    await ctx.service.createManual(actor, baseInput, "key-bbbbbbbb");
    await expect(
      ctx.service.createManual(actor, { ...baseInput, amountMinor: 99_000 }, "key-bbbbbbbb"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", statusCode: 409 });
    expect(ctx.store.transactions).toHaveLength(1);
  });

  it("executes normally without a key: no claim, no replay (AC-F3-8)", async () => {
    const first = await ctx.service.createManual(actor, baseInput);
    const second = await ctx.service.createManual(actor, baseInput);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    /* Two distinct rows: a keyless retry is a new mutation, not a replay. */
    expect(ctx.store.transactions).toHaveLength(2);
    expect(ctx.store.transactions[0]?.id).not.toBe(ctx.store.transactions[1]?.id);
    expect(ctx.store.idempotency.size).toBe(0);
  });

  it("lists active rows only and supports soft delete + restore (A-17)", async () => {
    await ctx.service.createManual(actor, baseInput);
    await ctx.service.softDelete(actor, ctx.store.transactions[0]!.id, USER);

    const active = await ctx.service.list(actor, {});
    expect((active.body as { rows: unknown[] }).rows).toHaveLength(0);
    const trash = await ctx.service.listTrash(actor);
    expect((trash.body as { rows: unknown[] }).rows).toHaveLength(1);

    await ctx.service.restore(actor, ctx.store.transactions[0]!.id);
    const restored = await ctx.service.list(actor, {});
    expect((restored.body as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("reports a second soft delete as alreadyDeleted but still 200 (A-17)", async () => {
    await ctx.service.createManual(actor, baseInput);
    const id = ctx.store.transactions[0]!.id;
    await ctx.service.softDelete(actor, id, USER);
    const second = await ctx.service.softDelete(actor, id, USER);
    expect(second.status).toBe(200);
    expect((second.body as { alreadyDeleted: boolean }).alreadyDeleted).toBe(true);
  });

  it("returns 404 for cross-household ids without revealing existence (ADR-006)", async () => {
    await expect(
      ctx.service.softDelete(
        { ...actor, householdId: "22222222-2222-4222-8222-222222222222" },
        ctx.store.transactions[0]?.id ?? "x",
        USER,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});