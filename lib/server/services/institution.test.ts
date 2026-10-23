/*
  Synthetic private institution names in this file (for example "Bank Pasar
  Loka") are test fixtures only. They are never seeded into the official OJK
  catalog; official rows in these tests are explicit fixtures with OJK-shaped
  provenance.
*/

import { beforeEach, describe, expect, it } from "vitest";
import { normalizeInstitutionName } from "@/lib/institution-name";
import type {
  BankInstitutionRecord,
  UserCustomInstitutionRecord,
} from "../repositories/institutions";
import type {
  LedgerRepositories,
  WalletInstitutionRecord,
} from "../repositories/ledger";
import { createFakeLedger, createFakeStore, type FakeStore } from "../testing/fakes";
import {
  InstitutionService,
  resolveWalletInstitution,
  toWalletInstitutionDTO,
} from "./institution";
import { IdempotencyService } from "./idempotency";
import { toWalletCardDTO, WalletService } from "./wallet";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";

const owner = { userId: OWNER, householdId: HOUSEHOLD, role: "OWNER" };
const member = { userId: MEMBER, householdId: HOUSEHOLD, role: "MEMBER" };

function pushOfficial(
  store: FakeStore,
  overrides: Partial<BankInstitutionRecord> = {},
): BankInstitutionRecord {
  const displayName = overrides.displayName ?? "PT BANK RAKYAT INDONESIA (PERSERO) Tbk";
  const row: BankInstitutionRecord = {
    id: crypto.randomUUID(),
    displayName,
    normalizedName: normalizeInstitutionName(displayName),
    source: "OJK_OFFICE_LIST",
    sourceUrl: "https://ojk.go.id/example",
    sourcePeriod: "2026-06",
    sourceRef: "002",
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

function pushWallet(
  store: FakeStore,
  overrides: Partial<Parameters<WalletService["create"]>[1]> & {
    officialInstitutionId?: string | null;
    customInstitutionId?: string | null;
    createdByUserId?: string;
    scope?: "PERSONAL" | "SHARING";
    archivedAt?: Date | null;
  } = {},
) {
  const officialInstitutionId = overrides.officialInstitutionId ?? null;
  const customInstitutionId = overrides.customInstitutionId ?? null;
  const wallet = {
    id: crypto.randomUUID(),
    householdId: HOUSEHOLD,
    createdByUserId: overrides.createdByUserId ?? OWNER,
    createdByDisplayName: "Owner",
    scope: overrides.scope ?? "SHARING",
    name: "Dompet",
    purpose: null,
    openingBalanceMinor: 0,
    officialInstitutionId,
    customInstitutionId,
    institution: null as WalletInstitutionRecord | null,
    archivedAt: overrides.archivedAt ?? null,
    archivedByUserId: null,
    systemKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.wallets.push(wallet);
  return wallet;
}

function setup(): {
  service: InstitutionService;
  wallets: WalletService;
  repos: LedgerRepositories;
  store: FakeStore;
} {
  const store = createFakeStore();
  const { repos, transaction } = createFakeLedger(store);
  const idempotency = new IdempotencyService(transaction);
  return {
    service: new InstitutionService(repos, transaction, idempotency),
    wallets: new WalletService(repos, transaction, idempotency),
    repos,
    store,
  };
}

describe("normalizeInstitutionName (AC-BI-5)", () => {
  it("applies NFKC, trim, whitespace collapse, and case-fold", () => {
    expect(normalizeInstitutionName("  Bank\u00a0  Rakyat  ")).toBe("bank rakyat");
    expect(normalizeInstitutionName("ＢＡＮＫ   RAKYAT")).toBe("bank rakyat");
    expect(normalizeInstitutionName("Bank\tPasar\nLoka")).toBe("bank pasar loka");
  });
});

describe("InstitutionService (AC-BI-1, AC-BI-3, AC-BI-4, AC-BI-5, AC-BI-8)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("lists active official rows and only the caller's active custom rows (AC-BI-1/AC-BI-3)", async () => {
    pushOfficial(ctx.store, { displayName: "PT BANK CENTRAL ASIA Tbk" });
    pushOfficial(ctx.store, { displayName: "PT BANK NONAKTIF", isActive: false });
    pushCustom(ctx.store, { userId: OWNER, displayName: "Bank Pasar Loka" });
    pushCustom(ctx.store, { userId: MEMBER, displayName: "Bank Rahasia" });
    pushCustom(ctx.store, { userId: OWNER, displayName: "Bank Lama", archivedAt: new Date() });

    const dto = await ctx.service.list(owner);
    expect(dto.official.map((row) => row.name)).toEqual(["PT BANK CENTRAL ASIA Tbk"]);
    expect(dto.custom.map((row) => row.name)).toEqual(["Bank Pasar Loka"]);
    /* Archived entries are owner-only and returned separately for the Arsip tab. */
    expect(dto.archivedCustom.map((row) => row.name)).toEqual(["Bank Lama"]);
  });

  it("filters both groups by the normalized query", async () => {
    pushOfficial(ctx.store, { displayName: "PT BANK RAKYAT INDONESIA (PERSERO) Tbk" });
    pushCustom(ctx.store, { userId: OWNER, displayName: "Bank Rakyat Daerah" });
    const dto = await ctx.service.list(owner, "  RAKYAT ");
    expect(dto.official).toHaveLength(1);
    expect(dto.custom).toHaveLength(1);
  });

  it("creates a private entry and never touches the official catalog (AC-BI-3/AC-BI-4)", async () => {
    const result = await ctx.service.quickAdd(owner, "  Bank   Pasar Loka  ");
    expect(result.status).toBe(201);
    const body = result.body as { id: string; name: string };
    expect(body.name).toBe("Bank Pasar Loka");
    expect(ctx.store.customInstitutions).toHaveLength(1);
    expect(ctx.store.customInstitutions[0]).toMatchObject({
      userId: OWNER,
      normalizedName: "bank pasar loka",
      archivedAt: null,
    });
    expect(ctx.store.officialInstitutions).toHaveLength(0);
    /* Quick Add is independent of wallets: no wallet row is created. */
    expect(ctx.store.wallets).toHaveLength(0);
  });

  it("routes an official duplicate to the catalog instead of creating a private row (AC-BI-5/Q8)", async () => {
    const official = pushOfficial(ctx.store, { displayName: "PT BANK CENTRAL ASIA Tbk" });
    const failure = await ctx.service.quickAdd(owner, "pt bank central asia tbk").catch((error) => error);
    expect(failure).toMatchObject({
      statusCode: 409,
      code: "INSTITUTION_ALREADY_EXISTS",
      meta: { existing: { kind: "OFFICIAL", id: official.id, name: official.displayName } },
    });
    expect(ctx.store.customInstitutions).toHaveLength(0);
  });

  it("blocks an active private duplicate and returns the caller's existing row (AC-BI-5)", async () => {
    const existing = pushCustom(ctx.store, { userId: OWNER, displayName: "Bank   Pasar Loka" });
    const failure = await ctx.service
      .quickAdd(owner, "bank pasar loka")
      .catch((error) => error);
    expect(failure).toMatchObject({
      statusCode: 409,
      code: "INSTITUTION_ALREADY_EXISTS",
      meta: { existing: { kind: "CUSTOM", id: existing.id, name: existing.displayName } },
    });
    expect(ctx.store.customInstitutions).toHaveLength(1);
  });

  it("is idempotent for the same key and creates only one row (A-11/A-57)", async () => {
    const first = await ctx.service.quickAdd(owner, "Bank Pasar Loka", "key-quick-add-1");
    const replay = await ctx.service.quickAdd(owner, "Bank Pasar Loka", "key-quick-add-1");
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(ctx.store.customInstitutions).toHaveLength(1);
  });

  it("handles a concurrent insert race by re-reading the active row (A-54)", async () => {
    const existing = pushCustom(ctx.store, { userId: OWNER, displayName: "Bank Pasar Loka" });
    const original = ctx.repos.institution.findCustomByNormalized;
    let activeChecks = 0;
    ctx.repos.institution.findCustomByNormalized = async (userId, normalized, view) => {
      if (view === "active") {
        activeChecks += 1;
        /* Pretend the first check missed the row, as a concurrent insert would. */
        if (activeChecks === 1) return null;
      }
      return original(userId, normalized, view);
    };

    const failure = await ctx.service
      .quickAdd(owner, "Bank Pasar Loka")
      .catch((error) => error);
    expect(failure).toMatchObject({
      statusCode: 409,
      code: "INSTITUTION_ALREADY_EXISTS",
      meta: { existing: { kind: "CUSTOM", id: existing.id } },
    });
    expect(ctx.store.customInstitutions).toHaveLength(1);
  });

  it("reactivates an archived entry on re-add instead of creating a second active row (AC-BI-8)", async () => {
    const archived = pushCustom(ctx.store, {
      userId: OWNER,
      displayName: "Bank Pasar Loka",
      archivedAt: new Date(),
    });
    const result = await ctx.service.quickAdd(owner, "  BANK   pasar loka ");
    expect(result.status).toBe(200);
    expect((result.body as { id: string }).id).toBe(archived.id);
    expect(archived.archivedAt).toBeNull();
    expect(ctx.store.customInstitutions).toHaveLength(1);
  });

  it("archives and restores only the caller's entry (AC-BI-8/AC-BI-10)", async () => {
    const own = pushCustom(ctx.store, { userId: OWNER });
    const foreign = pushCustom(ctx.store, { userId: MEMBER });

    const archived = await ctx.service.setArchived(owner, own.id, true);
    expect(archived.archivedAt).not.toBeNull();
    expect((await ctx.service.list(owner)).custom).toHaveLength(0);

    const restored = await ctx.service.setArchived(owner, own.id, false);
    expect(restored.archivedAt).toBeNull();

    await expect(ctx.service.setArchived(owner, foreign.id, true)).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  it("rejects restoring an archived entry that now collides with an active official row (AC-BI-8/Q8)", async () => {
    const archived = pushCustom(ctx.store, {
      userId: OWNER,
      displayName: "Bank Pasar Loka",
      archivedAt: new Date(),
    });
    const official = pushOfficial(ctx.store, { displayName: "BANK PASAR LOKA" });

    const failure = await ctx.service
      .setArchived(owner, archived.id, false)
      .catch((error) => error);
    expect(failure).toMatchObject({
      statusCode: 409,
      code: "INSTITUTION_ALREADY_EXISTS",
      meta: { existing: { kind: "OFFICIAL", id: official.id, name: official.displayName } },
    });
    /* The private row stays archived and no private ownership leaks in the body. */
    expect(archived.archivedAt).not.toBeNull();
    expect(JSON.stringify(failure.meta)).not.toContain(OWNER);
    await expect(ctx.service.list(owner)).resolves.toMatchObject({
      custom: [],
      archivedCustom: [{ id: archived.id }],
    });
  });

  it("allows restoring when the same official name exists but is inactive", async () => {
    const archived = pushCustom(ctx.store, {
      userId: OWNER,
      displayName: "Bank Pasar Loka",
      archivedAt: new Date(),
    });
    pushOfficial(ctx.store, { displayName: "Bank Pasar Loka", isActive: false });

    const restored = await ctx.service.setArchived(owner, archived.id, false);
    expect(restored.archivedAt).toBeNull();
  });

  it("keeps a wallet label after its custom entry is archived (AC-BI-8)", async () => {
    const custom = pushCustom(ctx.store, { userId: OWNER, displayName: "Bank Pasar Loka" });
    const created = await ctx.wallets.create(owner, {
      name: "Dompet Pasar",
      scope: "PERSONAL",
      institution: { kind: "CUSTOM", id: custom.id },
    });
    const walletId = (created.body as { id: string }).id;

    await ctx.service.setArchived(owner, custom.id, true);
    const dto = await ctx.wallets.get(owner, walletId);
    expect(dto.institution).toEqual({ kind: "CUSTOM", id: custom.id, name: "Bank Pasar Loka" });
    expect(ctx.store.customInstitutions[0]?.archivedAt).not.toBeNull();
  });

  it("rejects a foreign custom id with a generic 404 and an archived own id with 422 (AC-BI-10)", async () => {
    const foreign = pushCustom(ctx.store, { userId: MEMBER });
    const archived = pushCustom(ctx.store, {
      userId: OWNER,
      displayName: "Bank Lama",
      archivedAt: new Date(),
    });

    await expect(
      resolveWalletInstitution(ctx.repos.institution, owner, { kind: "CUSTOM", id: foreign.id }),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    await expect(
      resolveWalletInstitution(ctx.repos.institution, owner, { kind: "CUSTOM", id: archived.id }),
    ).rejects.toMatchObject({ statusCode: 422, code: "INSTITUTION_UNAVAILABLE" });
  });

  it("rejects an inactive official id with 422 (AC-BI-7/AC-BI-13)", async () => {
    const inactive = pushOfficial(ctx.store, { isActive: false });
    await expect(
      resolveWalletInstitution(ctx.repos.institution, owner, { kind: "OFFICIAL", id: inactive.id }),
    ).rejects.toMatchObject({ statusCode: 422, code: "INSTITUTION_UNAVAILABLE" });
  });

  it("returns a custom id only to its owner and hides it from another reader (AC-BI-6)", () => {
    const custom = pushCustom(ctx.store, { userId: OWNER, displayName: "Bank Pasar Loka" });
    const wallet = pushWallet(ctx.store, { customInstitutionId: custom.id, createdByUserId: OWNER });
    wallet.institution = {
      kind: "CUSTOM",
      id: custom.id,
      name: custom.displayName,
      ownerUserId: OWNER,
    };

    expect(toWalletInstitutionDTO(owner, wallet)).toEqual({
      kind: "CUSTOM",
      id: custom.id,
      name: "Bank Pasar Loka",
    });
    expect(toWalletInstitutionDTO(member, wallet)).toEqual({
      kind: "CUSTOM",
      id: null,
      name: "Bank Pasar Loka",
    });
    /* The card projection never carries any institution id. */
    expect(toWalletCardDTO(wallet, 0, member).institution).toEqual({
      kind: "CUSTOM",
      name: "Bank Pasar Loka",
    });
  });
});
