import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import { IdempotencyService } from "@/lib/server/services/idempotency";
import { OcrService } from "@/lib/server/services/ocr";
import { TransactionService } from "@/lib/server/services/transaction";
import {
  createFakeBlobStore,
  createFakeLedger,
  createFakeOcrProvider,
  createFakeStore,
} from "@/lib/server/testing/fakes";
import { jakartaDateOnly } from "@/lib/server/jakarta";
import { GET as transactionsGet, POST as transactionsPost } from "./route";
import { POST as trashPost } from "./[id]/trash/route";
import { POST as restorePost } from "./[id]/restore/route";
import { GET as trashGet } from "./trash/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const WALLET = "66666666-6666-4666-8666-666666666666";
const WALLET_B = "77777777-7777-4777-8777-777777777777";

type Harness = ReturnType<typeof buildHarness>;

function seedWallet(store: ReturnType<typeof createFakeStore>, id = WALLET): void {
  store.wallets.push({
    id,
    householdId: HOUSEHOLD,
    createdByUserId: USER,
    createdByDisplayName: "Ana",
    scope: "SHARING",
    name: "Dompet Keluarga",
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

function buildHarness() {
  const store = createFakeStore();
  seedWallet(store, WALLET);
  seedWallet(store, WALLET_B);
  const { repos, transaction } = createFakeLedger(store);
  const idempotency = new IdempotencyService(transaction);
  const { provider } = createFakeOcrProvider({
    ok: true,
    model: "fake-model",
    raw: {
      merchant: "Toko Sinar",
      totalAmountMinor: 64_800,
      currencyCode: "IDR",
      occurredAt: "2026-10-01",
      category: "food",
      taxAmountMinor: 0,
      confidence: 0.92,
      missingFields: [],
      notes: null,
    },
  });
  const context: AuthenticatedContext = {
    state: {
      user: { id: USER, email: "ana@example.com", displayName: "Ana" },
      household: { id: HOUSEHOLD, name: "Keluarga Ana" },
      role: "OWNER",
      status: "APPROVED",
      nextAction: "OPEN_HOME",
    },
    userId: USER,
    householdId: HOUSEHOLD,
    role: "OWNER",
    sessionId: "sid-1",
    auth: {} as AuthenticatedContext["auth"],
    family: {} as AuthenticatedContext["family"],
    transactions: new TransactionService(repos, transaction, idempotency),
    wallets: {} as AuthenticatedContext["wallets"],
    institutions: {} as AuthenticatedContext["institutions"],
    ocr: new OcrService(repos, transaction, idempotency, provider, createFakeBlobStore().store),
    dashboard: {} as AuthenticatedContext["dashboard"],
    budget: {} as AuthenticatedContext["budget"],
    goals: {} as AuthenticatedContext["goals"],
    advisor: {} as AuthenticatedContext["advisor"],
  };
  return { context, store };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/transactions", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const manualBody = () => ({
  type: "MONEY_OUT",
  amountMinor: 25_000,
  category: "food",
  occurredAt: jakartaDateOnly(),
  note: "Makan siang",
  walletId: WALLET,
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("POST /api/transactions", () => {
  let harness: Harness;
  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("returns 422 with plain-language fieldErrors on invalid input (AC-F3-1)", async () => {
    const response = await transactionsPost(jsonRequest({ ...manualBody(), amountMinor: 0 }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.fieldErrors.amountMinor).toContain("Jumlah harus lebih dari 0.");
    expect(JSON.stringify(body)).not.toMatch(/constraint|stack/i);
  });

  it("returns 422 AMOUNT_OUT_OF_RANGE above int32 max (AC-F3-1)", async () => {
    const response = await transactionsPost(jsonRequest({ ...manualBody(), amountMinor: 2_147_483_648 }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AMOUNT_OUT_OF_RANGE", fieldErrors: { amountMinor: ["Jumlah terlalu besar."] } },
    });
  });

  it("returns 201 with two legs for a transfer (AC-F3-3)", async () => {
    const response = await transactionsPost(
      jsonRequest({
        type: "TRANSFER",
        amountMinor: 100_000,
        occurredAt: jakartaDateOnly(),
        fromWalletId: WALLET,
        toWalletId: WALLET_B,
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0].transferGroupId).toBe(body.transactions[1].transferGroupId);
    expect(response.headers.get("set-cookie") ?? "").toContain("financial_planner_session=");
  });

  it("replays the original response for a same key + payload retry (AC-F3-8)", async () => {
    const key = "11111111-2222-4333-8444-555555555555";
    const first = await transactionsPost(jsonRequest(manualBody(), { "idempotency-key": key }));
    const second = await transactionsPost(jsonRequest(manualBody(), { "idempotency-key": key }));
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(harness.store.transactions).toHaveLength(1);
  });

  it("returns 409 IDEMPOTENCY_CONFLICT for same key + different payload (AC-F3-8)", async () => {
    const key = "11111111-2222-4333-8444-555555555555";
    await transactionsPost(jsonRequest(manualBody(), { "idempotency-key": key }));
    const response = await transactionsPost(
      jsonRequest({ ...manualBody(), amountMinor: 99_000 }, { "idempotency-key": key }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  it("rejects a malformed Idempotency-Key with 400", async () => {
    const response = await transactionsPost(jsonRequest(manualBody(), { "idempotency-key": "short" }));
    expect(response.status).toBe(400);
  });

  it("does not create a transaction when source=OCR has no receiptId (AC-F3-4)", async () => {
    const response = await transactionsPost(jsonRequest({ ...manualBody(), source: "OCR" }));
    expect(response.status).toBe(422);
    expect(harness.store.order).not.toContain("transaction.create");
  });
});

describe("GET /api/transactions + trash/restore", () => {
  let harness: Harness;

  beforeEach(async () => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    await transactionsPost(jsonRequest(manualBody()));
  });

  it("lists active rows only, then moves the row to trash and restores it (AC-F3-8, A-17)", async () => {
    const listResponse = await transactionsGet(new Request("http://localhost/api/transactions"));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(list.rows).toHaveLength(1);
    const id = list.rows[0].id as string;

    const trashResponse = await trashPost(new Request("http://localhost/x", { method: "POST" }), params(id));
    expect(trashResponse.status).toBe(200);

    const activeAfter = await (await transactionsGet(new Request("http://localhost/api/transactions"))).json();
    expect(activeAfter.rows).toHaveLength(0);
    const trashList = await (await trashGet(new Request("http://localhost/api/transactions/trash"))).json();
    expect(trashList.rows).toHaveLength(1);

    const restoreResponse = await restorePost(new Request("http://localhost/x", { method: "POST" }), params(id));
    expect(restoreResponse.status).toBe(200);
    const activeRestored = await (await transactionsGet(new Request("http://localhost/api/transactions"))).json();
    expect(activeRestored.rows).toHaveLength(1);
  });

  it("returns 404 for an unknown id and never a 5xx", async () => {
    const response = await trashPost(
      new Request("http://localhost/x", { method: "POST" }),
      params("99999999-9999-4999-8999-999999999999"),
    );
    expect(response.status).toBe(404);
  });

  it("maps a PENDING member to a typed 403", async () => {
    const { forbidden } = await import("@/lib/server/errors");
    vi.mocked(authenticatedRequest).mockRejectedValue(
      forbidden("ACCESS_PENDING", "Akun Anda belum memiliki akses ke data keluarga."),
    );
    const response = await transactionsGet(new Request("http://localhost/api/transactions"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCESS_PENDING" } });
  });
});
