/*
  Synthetic private institution names are test fixtures only and are never
  seeded into the official catalog. Official rows are explicit OJK-shaped test
  fixtures.
*/

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import type { BankInstitutionRecord, UserCustomInstitutionRecord } from "@/lib/server/repositories/institutions";
import { normalizeInstitutionName } from "@/lib/institution-name";
import { IdempotencyService } from "@/lib/server/services/idempotency";
import { InstitutionService } from "@/lib/server/services/institution";
import { WalletService } from "@/lib/server/services/wallet";
import { createFakeLedger, createFakeStore, type FakeStore } from "@/lib/server/testing/fakes";
import { GET as institutionsGet } from "./route";
import { POST as customPost } from "./custom/route";
import { POST as archivePost } from "./custom/[id]/archive/route";
import { POST as restorePost } from "./custom/[id]/restore/route";
import { POST as walletsPost } from "../wallets/route";
import { PATCH as walletPatch } from "../wallets/[id]/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";

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
    userId: MEMBER,
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

function buildHarness(
  role = "MEMBER",
  userId = MEMBER,
  store: FakeStore = createFakeStore(),
) {
  const { repos, transaction } = createFakeLedger(store);
  const idempotency = new IdempotencyService(transaction);
  const context: AuthenticatedContext = {
    state: {
      user: { id: userId, email: "ana@example.com", displayName: "Ana" },
      household: { id: HOUSEHOLD, name: "Keluarga Ana" },
      role,
      status: "APPROVED",
      nextAction: "OPEN_HOME",
    },
    userId,
    householdId: HOUSEHOLD,
    role,
    sessionId: "sid-1",
    auth: {} as AuthenticatedContext["auth"],
    family: {} as AuthenticatedContext["family"],
    transactions: {} as AuthenticatedContext["transactions"],
    wallets: new WalletService(repos, transaction, idempotency),
    institutions: new InstitutionService(repos, transaction, idempotency),
    ocr: {} as AuthenticatedContext["ocr"],
    dashboard: {} as AuthenticatedContext["dashboard"],
    reports: {} as AuthenticatedContext["reports"],
    budget: {} as AuthenticatedContext["budget"],
    goals: {} as AuthenticatedContext["goals"],
    advisor: {} as AuthenticatedContext["advisor"],
  };
  return { context, store };
}

function jsonRequest(url: string, method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("/api/institutions (T-011 / A-57)", () => {
  let harness: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("lists official rows plus only the session user's active custom rows (AC-BI-1/AC-BI-3)", async () => {
    pushOfficial(harness.store);
    pushCustom(harness.store, { userId: MEMBER, displayName: "Bank Pasar Loka" });
    pushCustom(harness.store, { userId: OWNER, displayName: "Bank Rahasia" });
    pushCustom(harness.store, { userId: MEMBER, displayName: "Bank Lama", archivedAt: new Date() });

    const response = await institutionsGet(new Request("http://localhost/api/institutions"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      official: Array<{ name: string }>;
      custom: Array<{ name: string }>;
      archivedCustom: Array<{ name: string }>;
    };
    expect(body.official.map((row) => row.name)).toEqual(["PT BANK CENTRAL ASIA Tbk"]);
    expect(body.custom.map((row) => row.name)).toEqual(["Bank Pasar Loka"]);
    /* Only the caller's archived rows are exposed, in a separate additive list. */
    expect(body.archivedCustom.map((row) => row.name)).toEqual(["Bank Lama"]);
  });

  it("filters the response by ?q= (AC-BI-1)", async () => {
    pushOfficial(harness.store, { displayName: "PT BANK RAKYAT INDONESIA (PERSERO) Tbk" });
    pushOfficial(harness.store, { displayName: "PT BANK CENTRAL ASIA Tbk" });
    const response = await institutionsGet(
      new Request("http://localhost/api/institutions?q=%20rakyat%20"),
    );
    const body = (await response.json()) as { official: Array<{ name: string }> };
    expect(body.official.map((row) => row.name)).toEqual([
      "PT BANK RAKYAT INDONESIA (PERSERO) Tbk",
    ]);
  });

  it("creates a private Quick Add entry with an Idempotency-Key (AC-BI-3/AC-BI-4)", async () => {
    const request = jsonRequest(
      "http://localhost/api/institutions/custom",
      "POST",
      { name: "  Bank Pasar Loka " },
      { "Idempotency-Key": "quick-add-key-1" },
    );
    const response = await customPost(request);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string; archivedAt: null };
    expect(body.name).toBe("Bank Pasar Loka");
    expect(body.archivedAt).toBeNull();

    const replay = await customPost(
      jsonRequest(
        "http://localhost/api/institutions/custom",
        "POST",
        { name: "bank pasar loka" },
        { "Idempotency-Key": "quick-add-key-1" },
      ),
    );
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(body);
    expect(harness.store.customInstitutions).toHaveLength(1);
  });

  it("returns 409 with the public official match for a duplicate (AC-BI-5)", async () => {
    const official = pushOfficial(harness.store);
    const response = await customPost(
      jsonRequest("http://localhost/api/institutions/custom", "POST", {
        name: "pt bank central asia tbk",
      }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INSTITUTION_ALREADY_EXISTS",
        existing: { kind: "OFFICIAL", id: official.id, name: official.displayName },
      },
    });
  });

  it("returns 200 and the same id when re-adding an archived name (AC-BI-8)", async () => {
    const archived = pushCustom(harness.store, {
      userId: MEMBER,
      displayName: "Bank Pasar Loka",
      archivedAt: new Date(),
    });
    const response = await customPost(
      jsonRequest("http://localhost/api/institutions/custom", "POST", {
        name: "BANK   PASAR LOKA",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: archived.id, archivedAt: null });
  });

  it("archives and restores the caller's entry (AC-BI-8)", async () => {
    const own = pushCustom(harness.store, { userId: MEMBER });
    const archived = await archivePost(new Request("http://localhost/x", { method: "POST" }), params(own.id));
    expect(archived.status).toBe(200);
    await expect(archived.json()).resolves.toMatchObject({ id: own.id });
    expect(harness.store.customInstitutions[0]?.archivedAt).not.toBeNull();

    const restored = await restorePost(new Request("http://localhost/x", { method: "POST" }), params(own.id));
    expect(restored.status).toBe(200);
    expect(harness.store.customInstitutions[0]?.archivedAt).toBeNull();
  });

  it("rejects restoring an archived entry that collides with an active official name (AC-BI-8/Q8)", async () => {
    const archived = pushCustom(harness.store, {
      userId: MEMBER,
      displayName: "Bank Pasar Loka",
      archivedAt: new Date(),
    });
    const official = pushOfficial(harness.store, { displayName: "BANK PASAR LOKA" });

    const response = await restorePost(
      new Request("http://localhost/x", { method: "POST" }),
      params(archived.id),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; existing: { kind: string; id: string; name: string } };
    };
    expect(body.error).toMatchObject({
      code: "INSTITUTION_ALREADY_EXISTS",
      existing: { kind: "OFFICIAL", id: official.id, name: official.displayName },
    });
    expect(JSON.stringify(body)).not.toContain(MEMBER);
    expect(harness.store.customInstitutions[0]?.archivedAt).not.toBeNull();
  });

  it("hides another user's entry behind a generic 404 (AC-BI-10)", async () => {
    const foreign = pushCustom(harness.store, { userId: OWNER });
    const response = await archivePost(
      new Request("http://localhost/x", { method: "POST" }),
      params(foreign.id),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("validates the name and unknown keys (AC-BI-4)", async () => {
    const empty = await customPost(
      jsonRequest("http://localhost/api/institutions/custom", "POST", { name: "   " }),
    );
    expect(empty.status).toBe(422);
    await expect(empty.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", fieldErrors: { name: ["Nama bank atau penyedia belum diisi."] } },
    });

    const tooLong = await customPost(
      jsonRequest("http://localhost/api/institutions/custom", "POST", { name: "x".repeat(81) }),
    );
    expect(tooLong.status).toBe(422);

    const unknown = await customPost(
      jsonRequest("http://localhost/api/institutions/custom", "POST", {
        name: "Bank",
        category: "SYARIAH",
      }),
    );
    expect(unknown.status).toBe(422);
  });

  it("creates a wallet with an official row and clears it with NONE (AC-BI-2/AC-BI-7/AC-BI-9)", async () => {
    const official = pushOfficial(harness.store);
    const created = await walletsPost(
      jsonRequest("http://localhost/api/wallets", "POST", {
        name: "Dompet BCA",
        scope: "PERSONAL",
        institution: { kind: "OFFICIAL", id: official.id },
      }),
    );
    expect(created.status).toBe(201);
    const wallet = (await created.json()) as { id: string; institution: { kind: string; id: string } };
    expect(wallet.institution).toEqual({
      kind: "OFFICIAL",
      id: official.id,
      name: official.displayName,
    });

    const cleared = await walletPatch(
      jsonRequest(`http://localhost/api/wallets/${wallet.id}`, "PATCH", {
        institution: { kind: "NONE" },
      }),
      params(wallet.id),
    );
    expect(cleared.status).toBe(200);
    await expect(cleared.json()).resolves.toMatchObject({ institution: null });
  });

  it("rejects a foreign custom id on wallet create (AC-BI-10)", async () => {
    const foreign = pushCustom(harness.store, { userId: OWNER });
    const response = await walletsPost(
      jsonRequest("http://localhost/api/wallets", "POST", {
        name: "Dompet",
        scope: "PERSONAL",
        institution: { kind: "CUSTOM", id: foreign.id },
      }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
