import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import { MAX_RECEIPT_BYTES } from "@/lib/server/contracts/ocr";
import { IdempotencyService } from "@/lib/server/services/idempotency";
import { OcrService } from "@/lib/server/services/ocr";
import { TransactionService } from "@/lib/server/services/transaction";
import {
  createFakeBlobStore,
  createFakeLedger,
  createFakeOcrProvider,
  createFakeStore,
  type FakeStore,
} from "@/lib/server/testing/fakes";
import { POST as receiptsPost } from "./receipts/route";
import { GET as receiptImageGet } from "./receipts/[id]/image/route";
import { GET as jobGet } from "./jobs/[id]/route";
import { POST as retryPost } from "./jobs/[id]/retry/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OTHER_HOUSEHOLD = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "66666666-6666-4666-8666-666666666666";

const draft = {
  merchant: "Pasar Segar",
  totalAmountMinor: 64_800,
  currencyCode: "IDR",
  occurredAt: "2026-10-01",
  category: "food",
  taxAmountMinor: 0,
  confidence: 0.92,
  missingFields: [] as string[],
  notes: null,
};

function buildHarness(householdId = HOUSEHOLD) {
  const store = createFakeStore();
  const { repos, transaction } = createFakeLedger(store);
  const idempotency = new IdempotencyService(transaction);
  const { provider, extract } = createFakeOcrProvider({ ok: true, model: "fake-model", raw: draft });
  const { store: blob, put, get, objects } = createFakeBlobStore();
  const context: AuthenticatedContext = {
    state: {
      user: { id: USER, email: "ana@example.com", displayName: "Ana" },
      household: { id: householdId, name: "Keluarga Ana" },
      role: "OWNER",
      status: "APPROVED",
      nextAction: "OPEN_HOME",
    },
    userId: USER,
    householdId,
    role: "OWNER",
    sessionId: "sid-1",
    auth: {} as AuthenticatedContext["auth"],
    family: {} as AuthenticatedContext["family"],
    transactions: new TransactionService(repos, transaction, idempotency),
    ocr: new OcrService(repos, transaction, idempotency, provider, blob),
    dashboard: {} as AuthenticatedContext["dashboard"],
    budget: {} as AuthenticatedContext["budget"],
    goals: {} as AuthenticatedContext["goals"],
    wallets: {} as AuthenticatedContext["wallets"],
    institutions: {} as AuthenticatedContext["institutions"],
    advisor: {} as AuthenticatedContext["advisor"],
  };
  return { context, store, extract, put, get, objects };
}

function fileBytes(size: number): Uint8Array {
  return new Uint8Array(size).fill(9);
}

function uploadRequest(bytes: Uint8Array, type = "image/jpeg", key?: string): Request {
  const form = new FormData();
  form.append("file", new File([Buffer.from(bytes)], "struk.jpg", { type }));
  return new Request("http://localhost/api/ocr/receipts", {
    method: "POST",
    body: form,
    headers: key ? { "idempotency-key": key } : {},
  });
}

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("POST /api/ocr/receipts", () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("returns 200 with job+draft and no transaction on a valid upload (AC-F3-4)", async () => {
    const response = await receiptsPost(uploadRequest(fileBytes(128)));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job.status).toBe("SUCCEEDED");
    expect(body.draft.totalAmountMinor).toBe(64_800);
    expect(harness.store.receipts).toHaveLength(1);
    expect(harness.store.transactions).toHaveLength(0);
    expect(harness.store.order).not.toContain("transaction.create");
  });

  it("returns 422 FILE_INVALID for >4MB and bad mime, before processing (AC-F3-4, A-02/A-21)", async () => {
    const oversized = await receiptsPost(uploadRequest(fileBytes(MAX_RECEIPT_BYTES + 1)));
    expect(oversized.status).toBe(422);
    await expect(oversized.json()).resolves.toMatchObject({
      error: { code: "FILE_INVALID", fieldErrors: { file: ["Ukuran foto maksimal 4 MB."] } },
    });

    const badMime = await receiptsPost(uploadRequest(fileBytes(64), "image/gif"));
    expect(badMime.status).toBe(422);
    await expect(badMime.json()).resolves.toMatchObject({ error: { code: "FILE_INVALID" } });
    expect(harness.put).not.toHaveBeenCalled();
    expect(harness.extract).not.toHaveBeenCalled();
  });

  it("returns 422 FILE_INVALID when the form has no file", async () => {
    const form = new FormData();
    const response = await receiptsPost(
      new Request("http://localhost/api/ocr/receipts", { method: "POST", body: form }),
    );
    expect(response.status).toBe(422);
  });

  it("returns 409 DUPLICATE_RECEIPT + existing job without reprocessing (AC-F3-6)", async () => {
    const bytes = fileBytes(128);
    const first = await receiptsPost(uploadRequest(bytes));
    expect(first.status).toBe(200);
    harness.extract.mockClear();
    harness.put.mockClear();

    const duplicate = await receiptsPost(uploadRequest(bytes));
    expect(duplicate.status).toBe(409);
    const body = await duplicate.json();
    expect(body.error.code).toBe("DUPLICATE_RECEIPT");
    expect(body.job.status).toBe("SUCCEEDED");
    expect(body.draft.merchant).toBe("Pasar Segar");
    expect(harness.extract).not.toHaveBeenCalled();
    expect(harness.put).not.toHaveBeenCalled();
  });

  it("replays a committed 200 job+draft for the same key + payload (A-11)", async () => {
    const bytes = fileBytes(128);
    const key = "11111111-2222-4333-8444-555555555556";
    const first = await receiptsPost(uploadRequest(bytes, "image/jpeg", key));
    const second = await receiptsPost(uploadRequest(bytes, "image/jpeg", key));
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(harness.store.receipts).toHaveLength(1);
    expect(harness.put).toHaveBeenCalledOnce();
  });

  it("replays a committed 409 for the same idempotency key + payload (A-11)", async () => {
    const bytes = fileBytes(128);
    await receiptsPost(uploadRequest(bytes));
    const key = "11111111-2222-4333-8444-555555555555";
    const first = await receiptsPost(uploadRequest(bytes, "image/jpeg", key));
    const second = await receiptsPost(uploadRequest(bytes, "image/jpeg", key));
    expect(first.status).toBe(409);
    expect(await second.json()).toEqual(await first.json());
    expect(harness.store.receipts).toHaveLength(1);
  });

  it("never leaks server credentials in the response body (AC-F3-9)", async () => {
    const response = await receiptsPost(uploadRequest(fileBytes(64)));
    const text = JSON.stringify(await response.json());
    for (const name of ["GEMINI_API_KEY", "DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "AUTH_SECRET", "NEXT_PUBLIC_"]) {
      expect(text).not.toContain(name);
    }
  });
});

describe("GET /api/ocr/jobs/{id}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the job + draft scoped to the household", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const upload = await receiptsPost(uploadRequest(fileBytes(128)));
    const jobId = (await upload.json()).job.id as string;

    const response = await jobGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: jobId }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ draft: { merchant: "Pasar Segar" } });
  });

  it("returns 404 for a cross-household job (ADR-006)", async () => {
    const owner = buildHarness(HOUSEHOLD);
    vi.mocked(authenticatedRequest).mockResolvedValue(owner.context);
    const upload = await receiptsPost(uploadRequest(fileBytes(128)));
    const jobId = (await upload.json()).job.id as string;

    vi.mocked(authenticatedRequest).mockResolvedValue({
      ...buildHarness("22222222-2222-4222-8222-222222222222").context,
      ocr: owner.context.ocr,
      transactions: owner.context.transactions,
    });
    const response = await jobGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: jobId }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a non-uuid job id", async () => {
    vi.mocked(authenticatedRequest).mockResolvedValue(buildHarness().context);
    const response = await jobGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "bukan-uuid" }),
    });
    expect(response.status).toBe(404);
  });
});

/*
  GET /api/ocr/receipts/{id}/image (C-30, A-46/C-28/C-29).

  Route-level coverage of the private byte stream: the response carries image
  bytes only (mime + `private, no-store`, no Blob URL, storage key, OCR
  job/draft/flag or transaction row), PERSONAL-only visibility is a generic
  404, the SHARING union counts soft-deleted links, and the sibling job route
  stays uploader-only. No provider or Vercel Blob client is contacted: both the
  OCR provider and the blob store are the in-memory fakes.
*/
describe("GET /api/ocr/receipts/{id}/image", () => {
  const W_SHARED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const W_PERSONAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const FOREIGN_USER = "66666666-6666-4666-8666-666666666666";

  function actorContext(userId: string, ocr: OcrService): AuthenticatedContext {
    return {
      state: {
        user: { id: userId, email: `${userId}@example.com`, displayName: "Anggota" },
        household: { id: HOUSEHOLD, name: "Keluarga Ana" },
        role: userId === USER ? "OWNER" : "MEMBER",
        status: "APPROVED",
        nextAction: "OPEN_HOME",
      },
      userId,
      householdId: HOUSEHOLD,
      role: userId === USER ? "OWNER" : "MEMBER",
      sessionId: "sid-image",
      auth: {} as AuthenticatedContext["auth"],
      family: {} as AuthenticatedContext["family"],
      transactions: {} as AuthenticatedContext["transactions"],
      ocr,
      dashboard: {} as AuthenticatedContext["dashboard"],
      budget: {} as AuthenticatedContext["budget"],
      goals: {} as AuthenticatedContext["goals"],
      wallets: {} as AuthenticatedContext["wallets"],
      institutions: {} as AuthenticatedContext["institutions"],
      advisor: {} as AuthenticatedContext["advisor"],
    };
  }

  /**
   * One household, two members, two wallets. The uploader is `USER`; the other
   * member is `FOREIGN_USER` (same household, different person).
   */
  function buildImageHarness() {
    const store = createFakeStore();
    for (const [id, scope, owner] of [
      [W_SHARED, "SHARING", USER],
      [W_PERSONAL, "PERSONAL", USER],
    ] as const) {
      store.wallets.push({
        id,
        householdId: HOUSEHOLD,
        createdByUserId: owner,
        createdByDisplayName: "Ana",
        scope,
        name: scope === "SHARING" ? "Dompet Keluarga" : "Dompet Pribadi",
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
    const { repos, transaction } = createFakeLedger(store);
    const idempotency = new IdempotencyService(transaction);
    const { provider, extract } = createFakeOcrProvider({ ok: true, model: "fake-model", raw: draft });
    const { store: blob, put, get, objects } = createFakeBlobStore();
    const ocr = new OcrService(repos, transaction, idempotency, provider, blob);
    return {
      store,
      ocr,
      put,
      get,
      objects,
      extract,
      uploader: actorContext(USER, ocr),
      other: actorContext(FOREIGN_USER, ocr),
    };
  }

  const uploaderActor = { userId: USER, householdId: HOUSEHOLD, role: "OWNER" };

  /** Uploads a receipt as the uploader and returns its receipt id. */
  async function uploadReceipt(ctx: ReturnType<typeof buildImageHarness>, bytes: number[]) {
    const result = await ctx.ocr.upload(uploaderActor, {
      bytes: new Uint8Array(bytes),
      mimeType: "image/jpeg",
      sizeBytes: bytes.length,
    });
    expect(result.status).toBe(200);
    return (result.body as { job: { id: string; receiptId: string } }).job;
  }

  function linkReceipt(
    store: FakeStore,
    receiptId: string,
    walletId: string,
    deletedAt: Date | null = null,
  ): void {
    store.transactions.push({
      id: crypto.randomUUID(),
      householdId: HOUSEHOLD,
      createdByUserId: USER,
      type: "MONEY_OUT",
      amountMinor: 10_000,
      currencyCode: "IDR",
      category: "food",
      merchant: null,
      note: null,
      occurredAt: new Date(),
      source: "OCR",
      receiptId,
      transferGroupId: null,
      walletId,
      deletedAt,
      deletedByUserId: deletedAt ? USER : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams the private image bytes with mime + private,no-store and no URL/key/job/draft (C-30)", async () => {
    const ctx = buildImageHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.uploader);
    const job = await uploadReceipt(ctx, [1, 2, 3, 4]);

    const response = await receiptImageGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: job.receiptId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe("inline");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4]);

    /* The response never leaks storage or OCR metadata. */
    const headers = JSON.stringify(Object.fromEntries(response.headers.entries()));
    expect(headers).not.toContain("https://blob.example");
    expect(headers).not.toContain(`receipts/${HOUSEHOLD}`);
    expect(headers).not.toContain("job");
    /* Only bytes are served: there is no JSON body to carry job/draft/flag. */
    expect(response.headers.get("content-type")).not.toContain("application/json");
  });

  it("never exposes a public Blob URL, storage key, job, draft or transaction row (C-28/C-29)", async () => {
    const ctx = buildImageHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.uploader);
    const job = await uploadReceipt(ctx, [5, 6, 7]);

    const response = await receiptImageGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: job.receiptId }),
    });
    const bodyText = new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()));
    expect(bodyText).not.toContain("blob.example");
    expect(bodyText).not.toContain("receipts/");
    expect(bodyText).not.toContain(job.id);
    expect(bodyText.toLowerCase()).not.toContain("draft");
    expect(bodyText.toLowerCase()).not.toContain("receiptsharedwithhousehold");
  });

  it("keeps the image household-visible through a soft-deleted SHARING link (union includes trashed, C-28)", async () => {
    const ctx = buildImageHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.uploader);
    const job = await uploadReceipt(ctx, [8, 8, 8]);
    linkReceipt(ctx.store, job.receiptId, W_SHARED, new Date());

    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.other);
    const response = await receiptImageGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: job.receiptId }),
    });
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([8, 8, 8]);
  });

  it("answers 404 NOT_FOUND generically for a PERSONAL-only receipt (no existence leak)", async () => {
    const ctx = buildImageHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.uploader);
    const job = await uploadReceipt(ctx, [9, 9, 9]);
    linkReceipt(ctx.store, job.receiptId, W_PERSONAL);

    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.other);
    const response = await receiptImageGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: job.receiptId }),
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "NOT_FOUND" } });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(job.receiptId);
    expect(serialized).not.toContain(`receipts/${HOUSEHOLD}`);
  });

  it("answers 404 for an unknown receipt id and for a missing blob object", async () => {
    const ctx = buildImageHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.uploader);

    const unknown = await receiptImageGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "77777777-7777-4777-8777-777777777777" }),
    });
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });

    /* Storage lost the object: generic 404, never a storage error page. */
    const job = await uploadReceipt(ctx, [4, 5, 6]);
    ctx.objects.clear();
    const missing = await receiptImageGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: job.receiptId }),
    });
    expect(missing.status).toBe(404);
  });

  it("rejects a malformed id with 404 before touching storage", async () => {
    const ctx = buildImageHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.uploader);
    const response = await receiptImageGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "bukan-uuid" }),
    });
    expect(response.status).toBe(404);
    expect(ctx.get).not.toHaveBeenCalled();
  });

  it("leaves the OCR job/draft/flag uploader-only even when the image is share-visible (C-29)", async () => {
    const ctx = buildImageHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.uploader);
    const job = await uploadReceipt(ctx, [1, 1, 2]);
    linkReceipt(ctx.store, job.receiptId, W_SHARED);

    /* The other member may read the bytes (union C-28)... */
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.other);
    const image = await receiptImageGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: job.receiptId }),
    });
    expect(image.status).toBe(200);

    /* ...but never the job, the draft, or the share flag (C-29). */
    const jobResponse = await jobGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: job.id }),
    });
    expect(jobResponse.status).toBe(404);
    await expect(jobResponse.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });

    /* Only the uploader gets the job and the server-computed flag. */
    vi.mocked(authenticatedRequest).mockResolvedValue(ctx.uploader);
    const mine = await jobGet(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: job.id }),
    });
    expect(mine.status).toBe(200);
    await expect(mine.json()).resolves.toMatchObject({
      job: { receiptSharedWithHousehold: true },
      draft: { merchant: "Pasar Segar" },
    });
  });
});

/*
  POST /api/ocr/jobs/{id}/retry (T-012 / AC-F3-10..13).

  Route-level contract: required Idempotency-Key, no request body, generic 404
  for missing/foreign/non-uploader jobs, the three 409 control codes, and a
  model failure that stays HTTP 200 with `draft: null`. The stored image comes
  from the in-memory blob fake; no Vercel Blob or Gemini call is made.
*/
describe("POST /api/ocr/jobs/{id}/retry", () => {
  function retryRequest(key?: string): Request {
    /* No body: the retry only re-reads the private stored bytes. */
    return new Request("http://localhost/api/ocr/jobs/x/retry", {
      method: "POST",
      headers: key ? { "idempotency-key": key } : {},
    });
  }

  function callRetry(jobId: string, key?: string) {
    return retryPost(retryRequest(key), { params: Promise.resolve({ id: jobId }) });
  }

  async function failedJob(harness: ReturnType<typeof buildHarness>) {
    const upload = await receiptsPost(uploadRequest(fileBytes(128)));
    const job = (await upload.json()).job as { id: string; receiptId: string };
    const row = harness.store.jobs.find((item) => item.id === job.id);
    if (!row) throw new Error("job fixture missing");
    row.status = "FAILED";
    row.errorCode = "OCR_TIMEOUT";
    row.completedAt = new Date();
    harness.extract.mockClear();
    return job;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Idempotency-Key before any lookup or provider call", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const job = await failedJob(harness);

    const response = await callRetry(job.id);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_IDEMPOTENCY_KEY" },
    });
    expect(harness.extract).not.toHaveBeenCalled();
    expect(harness.store.jobs).toHaveLength(1);
  });

  it("returns 200 { job, draft } with a new attempt and no transaction", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const job = await failedJob(harness);

    const response = await callRetry(job.id, "route-retry-key-0001");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toMatchObject({
      status: "SUCCEEDED",
      receiptId: job.receiptId,
      receiptSharedWithHousehold: false,
    });
    expect(body.draft.merchant).toBe("Pasar Segar");
    expect(harness.store.jobs.map((row) => row.attempt)).toEqual([1, 2]);
    expect(harness.store.transactions).toHaveLength(0);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(harness.store.receipts[0]?.storageKey ?? "receipts/");
    expect(serialized).not.toContain("receipts/");
    expect(serialized).not.toContain("blob.example");
  });

  it("keeps a model failure at HTTP 200 with the FAILED job and draft null", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const job = await failedJob(harness);
    harness.extract.mockResolvedValueOnce({ ok: false, errorCode: "OCR_RATE_LIMITED" });

    const response = await callRetry(job.id, "route-retry-key-0002");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: { status: "FAILED", errorCode: "OCR_RATE_LIMITED" },
      draft: null,
    });
    expect(harness.store.jobs.map((row) => row.attempt)).toEqual([1, 2]);
  });

  it("replays the same response for a repeated key without a second provider call", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const job = await failedJob(harness);

    const first = await callRetry(job.id, "route-retry-key-0003");
    const second = await callRetry(job.id, "route-retry-key-0003");
    expect(await second.json()).toEqual(await first.json());
    expect(harness.extract).toHaveBeenCalledTimes(1);
    expect(harness.store.jobs.map((row) => row.attempt)).toEqual([1, 2]);
  });

  it("answers 409 OCR_NOT_RETRYABLE for a stale target job", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const job = await failedJob(harness);
    await callRetry(job.id, "route-retry-key-0004");
    harness.extract.mockClear();

    const response = await callRetry(job.id, "route-retry-key-0005");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "OCR_NOT_RETRYABLE" },
    });
    expect(harness.extract).not.toHaveBeenCalled();
    expect(harness.store.jobs).toHaveLength(2);
  });

  it("answers 409 OCR_RETRY_IN_PROGRESS for a latest PROCESSING job", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const job = await failedJob(harness);
    const row = harness.store.jobs.find((item) => item.id === job.id);
    if (!row) throw new Error("job fixture missing");
    row.status = "PROCESSING";
    row.errorCode = null;

    const response = await callRetry(job.id, "route-retry-key-0006");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "OCR_RETRY_IN_PROGRESS" },
    });
    expect(harness.extract).not.toHaveBeenCalled();
  });

  it("answers 409 OCR_IMAGE_UNAVAILABLE when the stored blob is gone", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const job = await failedJob(harness);
    harness.objects.clear();

    const response = await callRetry(job.id, "route-retry-key-0007");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "OCR_IMAGE_UNAVAILABLE" },
    });
    expect(harness.extract).not.toHaveBeenCalled();
    expect(harness.store.jobs).toHaveLength(1);
    expect(harness.store.receipts).toHaveLength(1);
  });

  it("answers one generic 404 for another uploader or another household", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const job = await failedJob(harness);

    vi.mocked(authenticatedRequest).mockResolvedValue({
      ...harness.context,
      userId: OTHER_USER,
    });
    const otherMember = await callRetry(job.id, "route-retry-key-0008");
    expect(otherMember.status).toBe(404);
    const body = await otherMember.json();
    expect(body).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(JSON.stringify(body)).not.toContain(job.receiptId);
    expect(JSON.stringify(body)).not.toContain("receipts/");

    vi.mocked(authenticatedRequest).mockResolvedValue({
      ...harness.context,
      householdId: OTHER_HOUSEHOLD,
    });
    const foreignHousehold = await callRetry(job.id, "route-retry-key-0009");
    expect(foreignHousehold.status).toBe(404);
    await expect(foreignHousehold.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });

    expect(harness.extract).not.toHaveBeenCalled();
    expect(harness.store.jobs).toHaveLength(1);
  });

  it("rejects a malformed job id with 404 before touching storage", async () => {
    const harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);

    const response = await callRetry("bukan-uuid", "route-retry-key-0010");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(harness.get).not.toHaveBeenCalled();
    expect(harness.extract).not.toHaveBeenCalled();
  });
});

