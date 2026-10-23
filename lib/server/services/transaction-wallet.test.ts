import { beforeEach, describe, expect, it } from "vitest";
import { IdempotencyService } from "./idempotency";
import { TransactionService } from "./transaction";
import { createFakeLedger, createFakeStore, type FakeStore } from "../testing/fakes";
import type { LedgerRepositories, WalletRecord } from "../repositories/ledger";
import { jakartaDateOnly } from "../jakarta";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

const W_SHARED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const W_PERSONAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const W_ARCHIVED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const owner = { userId: OWNER, householdId: HOUSEHOLD, role: "OWNER" };
const member = { userId: MEMBER, householdId: HOUSEHOLD, role: "MEMBER" };
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

function setup(): { service: TransactionService; repos: LedgerRepositories; store: FakeStore } {
  const store = createFakeStore();
  store.wallets.push(
    wallet({ id: W_SHARED, scope: "SHARING", createdByUserId: OWNER, name: "Keluarga" }),
    wallet({ id: W_PERSONAL, scope: "PERSONAL", createdByUserId: MEMBER, name: "Tabungan" }),
    wallet({ id: W_ARCHIVED, scope: "SHARING", createdByUserId: OWNER, name: "Lama", archivedAt: new Date() }),
  );
  const { repos, transaction } = createFakeLedger(store);
  const service = new TransactionService(repos, transaction, new IdempotencyService(transaction));
  return { service, repos, store };
}

describe("TransactionService wallet binding (AC-F6-4, AC-F6-5, AC-F6-6)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("requires a wallet for MONEY_OUT (AC-F6-4)", async () => {
    await expect(
      ctx.service.createManual(member, {
        type: "MONEY_OUT",
        amountMinor: 10_000,
        category: "food",
        occurredAt: jakartaDateOnly(),
      }),
    ).rejects.toMatchObject({ statusCode: 422, fieldErrors: { walletId: ["Pilih dompet."] } });
  });

  it("rejects an archived wallet at submit with WALLET_UNAVAILABLE (A-43)", async () => {
    await expect(
      ctx.service.createManual(member, {
        type: "MONEY_OUT",
        amountMinor: 10_000,
        category: "food",
        occurredAt: jakartaDateOnly(),
        walletId: W_ARCHIVED,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: "WALLET_UNAVAILABLE" });
  });

  it("rejects a broken wallet pair with 422 VALIDATION_ERROR fieldErrors, never TRANSFER_INVALID (A-51)", async () => {
    /* Missing leg. */
    await expect(
      ctx.service.createManual(member, {
        type: "TRANSFER",
        amountMinor: 10_000,
        occurredAt: jakartaDateOnly(),
        toWalletId: W_SHARED,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR",
      fieldErrors: { fromWalletId: ["Pilih dompet asal."] },
    });

    await expect(
      ctx.service.createManual(member, {
        type: "TRANSFER",
        amountMinor: 10_000,
        occurredAt: jakartaDateOnly(),
        fromWalletId: W_SHARED,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR",
      fieldErrors: { toWalletId: ["Pilih dompet tujuan."] },
    });

    /* Same source and destination wallet. */
    await expect(
      ctx.service.createManual(member, {
        type: "TRANSFER",
        amountMinor: 10_000,
        occurredAt: jakartaDateOnly(),
        fromWalletId: W_SHARED,
        toWalletId: W_SHARED,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR",
      fieldErrors: { toWalletId: ["Dompet asal dan tujuan harus berbeda."] },
    });

    /* None of the rejected pairs persisted a leg. */
    expect(ctx.store.transactions).toHaveLength(0);
  });

  it("rejects an archived wallet inside a transfer pair with WALLET_UNAVAILABLE (A-43/A-51)", async () => {
    await expect(
      ctx.service.createManual(member, {
        type: "TRANSFER",
        amountMinor: 10_000,
        occurredAt: jakartaDateOnly(),
        fromWalletId: W_SHARED,
        toWalletId: W_ARCHIVED,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: "WALLET_UNAVAILABLE" });
    expect(ctx.store.transactions).toHaveLength(0);
  });

  it("answers 404 NOT_FOUND for a wallet the actor cannot see (A-51)", async () => {
    await expect(
      ctx.service.createManual(other, {
        type: "TRANSFER",
        amountMinor: 10_000,
        occurredAt: jakartaDateOnly(),
        fromWalletId: W_PERSONAL,
        toWalletId: W_SHARED,
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    expect(ctx.store.transactions).toHaveLength(0);
  });

  it("binds a MONEY_OUT row to the chosen visible wallet (AC-F6-4)", async () => {
    const result = await ctx.service.createManual(member, {
      type: "MONEY_OUT",
      amountMinor: 10_000,
      category: "food",
      occurredAt: jakartaDateOnly(),
      walletId: W_SHARED,
    });
    expect(result.status).toBe(201);
    expect(ctx.store.transactions[0]?.walletId).toBe(W_SHARED);
  });

  it("creates a cross-scope transfer pair and redacts it for non-owners (A-39/C-10)", async () => {
    const created = await ctx.service.createManual(member, {
      type: "TRANSFER",
      amountMinor: 50_000,
      occurredAt: jakartaDateOnly(),
      fromWalletId: W_PERSONAL,
      toWalletId: W_SHARED,
    });
    expect(created.status).toBe(201);
    expect(ctx.store.transactions).toHaveLength(2);

    /* The creator sees both legs with wallet refs. */
    const mine = await ctx.service.list(member, {});
    expect((mine.body as { rows: unknown[] }).rows).toHaveLength(2);
    expect((mine.body as { rows: Array<{ wallet: unknown }> }).rows.every((row) => row.wallet !== null)).toBe(true);

    /* Another member sees only the SHARING leg, projected generically. */
    const theirs = await ctx.service.list(other, {});
    const rows = (theirs.body as { rows: Array<{ wallet: unknown; transferGroupId: unknown; source: unknown; note: unknown }> }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.wallet).toBeNull();
    expect(rows[0]?.transferGroupId).toBeNull();
    expect(rows[0]?.source).toBeNull();
  });

  it("restricts cross-scope pair trash to the creator or Owner, atomically (A-41/C-20)", async () => {
    await ctx.service.createManual(member, {
      type: "TRANSFER",
      amountMinor: 50_000,
      occurredAt: jakartaDateOnly(),
      fromWalletId: W_PERSONAL,
      toWalletId: W_SHARED,
    });
    const sharedLeg = ctx.store.transactions.find((row) => row.walletId === W_SHARED)!;
    const personalLeg = ctx.store.transactions.find((row) => row.walletId === W_PERSONAL)!;

    /* An ordinary member can see the shared leg but may not mutate the pair. */
    await expect(ctx.service.softDelete(other, sharedLeg.id, OTHER)).rejects.toMatchObject({ statusCode: 403 });

    /* The Owner may (role privilege), and both legs move together. */
    const trashed = await ctx.service.softDelete(owner, sharedLeg.id, OWNER);
    expect(trashed.status).toBe(200);
    expect(ctx.store.transactions.find((row) => row.id === sharedLeg.id)?.deletedAt).not.toBeNull();
    expect(ctx.store.transactions.find((row) => row.id === personalLeg.id)?.deletedAt).not.toBeNull();

    /* The creator restores both legs atomically. */
    const restored = await ctx.service.restore(member, sharedLeg.id);
    expect(restored.status).toBe(200);
    expect(ctx.store.transactions.find((row) => row.id === sharedLeg.id)?.deletedAt).toBeNull();
    expect(ctx.store.transactions.find((row) => row.id === personalLeg.id)?.deletedAt).toBeNull();
  });
});
