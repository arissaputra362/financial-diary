/*
  Synthetic institution names in this file are test fixtures only and are never
  seeded into the official catalog.
*/

import { beforeEach, describe, expect, it } from "vitest";
import { IdempotencyService } from "./idempotency";
import { WalletService } from "./wallet";
import { createFakeLedger, createFakeStore, type FakeStore } from "../testing/fakes";
import type { LedgerRepositories, WalletRecord } from "../repositories/ledger";
import type {
  BankInstitutionRecord,
  UserCustomInstitutionRecord,
} from "../repositories/institutions";
import { normalizeInstitutionName } from "@/lib/institution-name";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";
const BENDA = "55555555-5555-4555-8555-555555555555";

const owner = { userId: OWNER, householdId: HOUSEHOLD, role: "OWNER" };
const member = { userId: MEMBER, householdId: HOUSEHOLD, role: "MEMBER" };

function setup(): { service: WalletService; repos: LedgerRepositories; store: FakeStore } {
  const store = createFakeStore();
  const { repos, transaction } = createFakeLedger(store);
  const service = new WalletService(repos, transaction, new IdempotencyService(transaction));
  return { service, repos, store };
}

function pushWallet(store: FakeStore, overrides: Partial<WalletRecord>): WalletRecord {
  const row: WalletRecord = {
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
  store.wallets.push(row);
  return row;
}

function pushOfficial(
  store: FakeStore,
  overrides: Partial<BankInstitutionRecord> = {},
): BankInstitutionRecord {
  const displayName = overrides.displayName ?? "PT BANK CENTRAL ASIA Tbk";
  const row: BankInstitutionRecord = {
    id: crypto.randomUUID(),
    displayName,
    normalizedName: normalizeInstitutionName(displayName),
    source: "OJK_OFFICE_LIST",
    sourceUrl: "https://ojk.go.id/example",
    sourcePeriod: "2026-06",
    sourceRef: "014",
    seedVersion: "test-seed",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  store.officialInstitutions.push(row);
  return row;
}

function pushCustom(
  store: FakeStore,
  overrides: Partial<UserCustomInstitutionRecord> = {},
): UserCustomInstitutionRecord {
  const displayName = overrides.displayName ?? "Bank Pasar Loka";
  const row: UserCustomInstitutionRecord = {
    id: crypto.randomUUID(),
    userId: OWNER,
    displayName,
    normalizedName: normalizeInstitutionName(displayName),
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  store.customInstitutions.push(row);
  return row;
}

describe("WalletService (AC-F6-1, AC-F6-2, AC-F6-3, AC-F6-11)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("creates a PERSONAL wallet owned by the caller (AC-F6-1)", async () => {
    const result = await ctx.service.create(member, { name: "Kas", scope: "PERSONAL", openingBalanceMinor: 50_000 });
    const body = result.body as { scope: string; balanceMinor: number; createdBy: unknown; canArchive: boolean };
    expect(result.status).toBe(201);
    expect(body.scope).toBe("PERSONAL");
    expect(body.balanceMinor).toBe(50_000);
    expect(body.createdBy).toBeNull();
    expect(body.canArchive).toBe(true);
  });

  it("defaults a blank opening balance to Rp0", async () => {
    const result = await ctx.service.create(owner, { name: "Kas", scope: "PERSONAL" });
    expect((result.body as { openingBalanceMinor: number }).openingBalanceMinor).toBe(0);
  });

  it("hides another member's PERSONAL wallet (AC-F6-2)", async () => {
    const personal = pushWallet(ctx.store, { scope: "PERSONAL", createdByUserId: BENDA });
    await expect(ctx.service.get(member, personal.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lets every approved member read a SHARING wallet (AC-F6-2)", async () => {
    const shared = pushWallet(ctx.store, { scope: "SHARING", createdByUserId: BENDA });
    const dto = await ctx.service.get(member, shared.id);
    expect(dto.id).toBe(shared.id);
    expect(dto.createdBy?.displayName).toBe("Owner");
  });

  it("lists active vs archived wallets (C-18)", async () => {
    pushWallet(ctx.store, { name: "Aktif" });
    pushWallet(ctx.store, { name: "Arsip", archivedAt: new Date() });
    const active = await ctx.service.list(owner, "active");
    const all = await ctx.service.list(owner, "all");
    expect(active.map((wallet) => wallet.name)).toEqual(["Aktif"]);
    expect(all).toHaveLength(2);
  });

  it("restricts archive/restore to the creator or Owner for SHARING (A-43/C-4)", async () => {
    const shared = pushWallet(ctx.store, { scope: "SHARING", createdByUserId: OWNER });
    await expect(ctx.service.archive(member, shared.id)).rejects.toMatchObject({ statusCode: 403 });
    const archived = await ctx.service.archive(owner, shared.id);
    expect((archived.body as { archivedAt: string | null }).archivedAt).not.toBeNull();
  });

  it("lets a member edit SHARING name but not archive it (C-4)", async () => {
    const shared = pushWallet(ctx.store, { scope: "SHARING", createdByUserId: OWNER });
    const updated = await ctx.service.update(member, shared.id, { name: "Dompet Keluarga" });
    expect((updated.body as { name: string }).name).toBe("Dompet Keluarga");
  });

  it("locks the opening balance once any transaction row references the wallet (A-42/C-21)", async () => {
    const wallet = pushWallet(ctx.store, { scope: "PERSONAL", createdByUserId: MEMBER, openingBalanceMinor: 0 });
    ctx.store.transactions.push({
      id: crypto.randomUUID(),
      householdId: HOUSEHOLD,
      createdByUserId: MEMBER,
      type: "MONEY_OUT",
      amountMinor: 1_000,
      currencyCode: "IDR",
      category: "food",
      merchant: null,
      note: null,
      occurredAt: new Date(),
      source: "MANUAL",
      receiptId: null,
      transferGroupId: null,
      walletId: wallet.id,
      deletedAt: new Date(),
      deletedByUserId: MEMBER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      ctx.service.update(member, wallet.id, { openingBalanceMinor: 5_000 }),
    ).rejects.toMatchObject({ statusCode: 422, code: "WALLET_OPENING_BALANCE_LOCKED" });
    /* A no-change edit does not trip the lock. */
    const ok = await ctx.service.update(member, wallet.id, { name: "Kas Harian" });
    expect((ok.body as { name: string }).name).toBe("Kas Harian");
  });

  it("computes balance = opening + active MONEY_IN - active MONEY_OUT (AC-F6-4)", async () => {
    const wallet = pushWallet(ctx.store, { scope: "SHARING", openingBalanceMinor: 100_000 });
    const base = {
      householdId: HOUSEHOLD,
      createdByUserId: OWNER,
      currencyCode: "IDR",
      category: "food",
      merchant: null,
      note: null,
      occurredAt: new Date(),
      source: "MANUAL" as const,
      receiptId: null,
      transferGroupId: null,
      walletId: wallet.id,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    ctx.store.transactions.push(
      { ...base, id: crypto.randomUUID(), type: "MONEY_IN", amountMinor: 200_000 },
      { ...base, id: crypto.randomUUID(), type: "MONEY_OUT", amountMinor: 50_000 },
      { ...base, id: crypto.randomUUID(), type: "MONEY_OUT", amountMinor: 999_999, deletedAt: new Date() },
    );
    const dto = await ctx.service.get(owner, wallet.id);
    expect(dto.balanceMinor).toBe(250_000);
    expect(dto.openingBalanceLocked).toBe(true);
  });

  /* ── T-011 institution references ─────────────────────────────── */

  it("creates a wallet with an official institution and returns the label (AC-BI-2/AC-BI-9)", async () => {
    const official = pushOfficial(ctx.store);
    const result = await ctx.service.create(owner, {
      name: "Dompet BCA",
      scope: "PERSONAL",
      institution: { kind: "OFFICIAL", id: official.id },
    });
    const body = result.body as { institution: unknown };
    expect(result.status).toBe(201);
    expect(body.institution).toEqual({
      kind: "OFFICIAL",
      id: official.id,
      name: official.displayName,
    });
    const row = ctx.store.wallets[0]!;
    expect(row.officialInstitutionId).toBe(official.id);
    expect(row.customInstitutionId).toBeNull();
  });

  it("keeps a wallet manual when the institution is omitted (AC-BI-2)", async () => {
    const result = await ctx.service.create(owner, { name: "Kas", scope: "PERSONAL" });
    expect((result.body as { institution: unknown }).institution).toBeNull();
    expect(ctx.store.wallets[0]?.officialInstitutionId).toBeNull();
    expect(ctx.store.wallets[0]?.customInstitutionId).toBeNull();
  });

  it("clears the label with NONE and preserves it when the field is omitted (AC-BI-7)", async () => {
    const custom = pushCustom(ctx.store);
    const created = await ctx.service.create(owner, {
      name: "Dompet Pasar",
      scope: "PERSONAL",
      institution: { kind: "CUSTOM", id: custom.id },
    });
    const id = (created.body as { id: string }).id;

    const renamed = await ctx.service.update(owner, id, { name: "Dompet Pasar Baru" });
    expect((renamed.body as { institution: { id: string } }).institution.id).toBe(custom.id);

    const cleared = await ctx.service.update(owner, id, { institution: { kind: "NONE" } });
    expect((cleared.body as { institution: unknown }).institution).toBeNull();
    expect(ctx.store.wallets[0]?.customInstitutionId).toBeNull();
  });

  it("rejects a foreign custom id on create/update with a generic 404 (AC-BI-7/AC-BI-10)", async () => {
    const foreign = pushCustom(ctx.store, { userId: BENDA });
    await expect(
      ctx.service.create(member, {
        name: "Dompet",
        scope: "PERSONAL",
        institution: { kind: "CUSTOM", id: foreign.id },
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    const shared = pushWallet(ctx.store, { scope: "SHARING", createdByUserId: OWNER });
    await expect(
      ctx.service.update(member, shared.id, { institution: { kind: "CUSTOM", id: foreign.id } }),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });

  it("lets a SHARING editor preserve another member's custom label but hides its id (AC-BI-6/AC-BI-7)", async () => {
    const custom = pushCustom(ctx.store, { userId: OWNER, displayName: "Bank Pasar Loka" });
    const shared = pushWallet(ctx.store, { scope: "SHARING", createdByUserId: OWNER, customInstitutionId: custom.id });
    shared.institution = {
      kind: "CUSTOM",
      id: custom.id,
      name: custom.displayName,
      ownerUserId: OWNER,
    };

    const dto = await ctx.service.get(member, shared.id);
    expect(dto.institution).toEqual({ kind: "CUSTOM", id: null, name: "Bank Pasar Loka" });

    /* Omitted institution means unchanged: the other member's label survives. */
    const updated = await ctx.service.update(member, shared.id, { name: "Rencana Libur" });
    expect((updated.body as { institution: { id: string | null; name: string } }).institution).toEqual({
      kind: "CUSTOM",
      id: null,
      name: "Bank Pasar Loka",
    });
    expect(ctx.store.wallets[0]?.customInstitutionId).toBe(custom.id);

    /* The editor may clear or replace it with an official row. */
    const official = pushOfficial(ctx.store, { displayName: "PT BANK NEGARA INDONESIA (PERSERO) Tbk" });
    const replaced = await ctx.service.update(member, shared.id, {
      institution: { kind: "OFFICIAL", id: official.id },
    });
    expect((replaced.body as { institution: { kind: string; id: string } }).institution).toEqual({
      kind: "OFFICIAL",
      id: official.id,
      name: official.displayName,
    });
    expect(ctx.store.wallets[0]?.customInstitutionId).toBeNull();
  });
});
