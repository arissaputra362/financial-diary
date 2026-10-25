import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import { IdempotencyService } from "@/lib/server/services/idempotency";
import { WalletService } from "@/lib/server/services/wallet";
import { createFakeLedger, createFakeStore, type FakeStore } from "@/lib/server/testing/fakes";
import { POST as walletsPost, GET as walletsGet } from "./route";
import { GET as walletGet, PATCH as walletPatch } from "./[id]/route";
import { POST as archivePost } from "./[id]/archive/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";

type Harness = ReturnType<typeof buildHarness>;

function buildHarness(role = "MEMBER", userId = MEMBER, store: FakeStore = createFakeStore()) {
  const { repos, transaction } = createFakeLedger(store);
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
    wallets: new WalletService(repos, transaction, new IdempotencyService(transaction)),
    institutions: {} as AuthenticatedContext["institutions"],
    ocr: {} as AuthenticatedContext["ocr"],
    dashboard: {} as AuthenticatedContext["dashboard"],
    reports: {} as AuthenticatedContext["reports"],
    budget: {} as AuthenticatedContext["budget"],
    goals: {} as AuthenticatedContext["goals"],
    advisor: {} as AuthenticatedContext["advisor"],
  };
  return { context, store };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/wallets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("/api/wallets (AC-F6-1, AC-F6-11, C-31)", () => {
  let harness: Harness;
  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("creates a wallet and lists it (AC-F6-1)", async () => {
    const created = await walletsPost(jsonRequest({ name: "Kas", scope: "PERSONAL", openingBalanceMinor: 1_000 }));
    expect(created.status).toBe(201);

    const list = await walletsGet(new Request("http://localhost/api/wallets?view=active"));
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.wallets).toHaveLength(1);
  });

  it("rejects a scope change on PATCH with 422 VALIDATION_ERROR fieldErrors.scope (C-31)", async () => {
    const created = await walletsPost(jsonRequest({ name: "Kas", scope: "PERSONAL" }));
    const { id } = (await created.json()) as { id: string };
    const response = await walletPatch(
      new Request("http://localhost/api/wallets/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "SHARING" }),
      }),
      params(id),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", fieldErrors: { scope: ["Jenis dompet tidak bisa diubah."] } },
    });

    const after = await walletGet(new Request("http://localhost/x"), params(id));
    await expect(after.json()).resolves.toMatchObject({ scope: "PERSONAL" });
  });

  it("updates name/purpose without scope (C-31)", async () => {
    const created = await walletsPost(jsonRequest({ name: "Kas", scope: "PERSONAL" }));
    const { id } = (await created.json()) as { id: string };
    const response = await walletPatch(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Kas Harian", purpose: "Sehari-hari" }),
      }),
      params(id),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ name: "Kas Harian", purpose: "Sehari-hari" });
  });

  it("returns 403 when a non-creator member archives a SHARING wallet (A-43)", async () => {
    const store = createFakeStore();
    harness = buildHarness("OWNER", OWNER, store);
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const created = await walletsPost(jsonRequest({ name: "Bersama", scope: "SHARING" }));
    const { id } = (await created.json()) as { id: string };

    harness = buildHarness("MEMBER", MEMBER, store);
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const response = await archivePost(new Request("http://localhost/x", { method: "POST" }), params(id));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCESS_DENIED" } });
  });

  it("returns 404 for an unknown wallet id (AC-F6-11)", async () => {
    const response = await walletGet(
      new Request("http://localhost/x"),
      params("99999999-9999-4999-8999-999999999999"),
    );
    expect(response.status).toBe(404);
  });
});
