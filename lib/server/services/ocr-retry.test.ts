/*
  T-012 OCR retry (AC-F3-10..13), service level.

  The real OcrService runs with the in-memory ledger/blob seams and an injected
  fake provider. No Gemini or Vercel Blob call happens. The "concurrency" case
  serializes the ledger transaction runner so the second retry starts only after
  the first attempt has committed, which is what the real Receipt row lock does.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OcrExtraction, OcrProvider } from "../providers/ocr";
import type { LedgerRepositories } from "../repositories/ledger";
import {
  createFakeBlobStore,
  createFakeLedger,
  createFakeStore,
} from "../testing/fakes";
import { IdempotencyService } from "./idempotency";
import { OcrService, type OcrActor } from "./ocr";
import type { LedgerTransaction } from "./types";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OTHER_HOUSEHOLD = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";

const actor: OcrActor = { userId: USER, householdId: HOUSEHOLD };
const otherMember: OcrActor = { userId: OTHER_USER, householdId: HOUSEHOLD };
const otherHousehold: OcrActor = { userId: USER, householdId: OTHER_HOUSEHOLD };

const success: OcrExtraction = {
  ok: true,
  model: "fake-model",
  raw: {
    merchant: "Pasar Segar",
    totalAmountMinor: 64_800,
    currencyCode: "IDR",
    occurredAt: "2026-10-01",
    category: "food",
    taxAmountMinor: 0,
    confidence: 0.92,
    missingFields: [],
    notes: null,
  },
};

/** Runs one ledger transaction at a time, modelling the Receipt row lock. */
function serialize(transaction: LedgerTransaction): LedgerTransaction {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: (repos: LedgerRepositories) => Promise<T>): Promise<T> => {
    const run = tail.then(() => transaction(fn));
    tail = run.catch(() => undefined);
    return run;
  };
}

function setup(serialized = false) {
  const store = createFakeStore();
  const { repos, transaction } = createFakeLedger(store);
  const run = serialized ? serialize(transaction) : transaction;
  const extract = vi.fn(
    async (): Promise<OcrExtraction> => ({
      ok: false,
      errorCode: "OCR_TIMEOUT",
    }),
  );
  const provider: OcrProvider = { extract };
  const blob = createFakeBlobStore();
  const service = new OcrService(repos, run, new IdempotencyService(run), provider, blob.store);
  return { service, store, extract, put: blob.put, objects: blob.objects };
}

type Harness = ReturnType<typeof setup>;

function fileBytes(size = 4): Uint8Array {
  return new Uint8Array(size).fill(7);
}

async function uploadFailed(ctx: Harness, size = 4) {
  const bytes = fileBytes(size);
  const result = await ctx.service.upload(actor, {
    bytes,
    mimeType: "image/jpeg",
    sizeBytes: bytes.byteLength,
  });
  const body = result.body as { job: { id: string; receiptId: string; status: string } };
  expect(result.status).toBe(200);
  expect(body.job.status).toBe("FAILED");
  return body.job;
}

function retry(ctx: Harness, jobId: string, key: string) {
  return ctx.service.retry(actor, jobId, key);
}

describe("OcrService.retry (T-012)", () => {
  let ctx: Harness;

  beforeEach(() => {
    ctx = setup();
  });

  it("creates exactly one new attempt using the stored bytes, with no Receipt or Transaction", async () => {
    const job = await uploadFailed(ctx);
    ctx.extract.mockClear();
    ctx.extract.mockResolvedValue(success);
    ctx.store.order.length = 0;

    const result = await retry(ctx, job.id, "retry-key-0001");
    const body = result.body as {
      job: { id: string; status: string; receiptId: string };
      draft: { merchant: string } | null;
    };

    expect(result.status).toBe(200);
    expect(body.job.status).toBe("SUCCEEDED");
    expect(body.job.receiptId).toBe(job.receiptId);
    expect(body.draft?.merchant).toBe("Pasar Segar");
    expect(ctx.extract).toHaveBeenCalledTimes(1);

    /* The retry used the original stored bytes, not new client bytes. */
    const [sent] = ctx.extract.mock.calls[0] as unknown as [Uint8Array, string];
    expect(Buffer.from(sent)).toEqual(Buffer.from(fileBytes()));

    /* Attempt sequence is explicit; the old FAILED job is untouched. */
    expect(ctx.store.jobs.map((row) => row.attempt)).toEqual([1, 2]);
    expect(ctx.store.jobs[0]).toMatchObject({
      id: job.id,
      status: "FAILED",
      errorCode: "OCR_TIMEOUT",
      attempt: 1,
    });

    /* Never a second Receipt and never a Transaction. */
    expect(ctx.store.receipts).toHaveLength(1);
    expect(ctx.store.transactions).toHaveLength(0);
    expect(ctx.store.order).not.toContain("receipt.create");
    expect(ctx.store.order).not.toContain("transaction.create");
  });

  it("retries only the latest FAILED job and allocates monotonically", async () => {
    const first = await uploadFailed(ctx);
    const secondResult = await retry(ctx, first.id, "retry-key-0002");
    const second = (secondResult.body as { job: { id: string; status: string } }).job;
    expect(second.status).toBe("FAILED");
    expect(ctx.store.jobs.map((row) => row.attempt)).toEqual([1, 2]);

    ctx.extract.mockClear();
    await expect(retry(ctx, first.id, "retry-key-0003")).rejects.toMatchObject({
      code: "OCR_NOT_RETRYABLE",
      statusCode: 409,
    });
    expect(ctx.extract).not.toHaveBeenCalled();
    expect(ctx.store.jobs).toHaveLength(2);

    /* A retry after a failed retry is allowed: the latest job is FAILED again. */
    ctx.extract.mockResolvedValue(success);
    const third = await retry(ctx, second.id, "retry-key-0004");
    expect((third.body as { job: { status: string } }).job.status).toBe("SUCCEEDED");
    expect(ctx.store.jobs.map((row) => row.attempt)).toEqual([1, 2, 3]);
  });

  it("rejects a target that is no longer the latest job after the lock", async () => {
    const first = await uploadFailed(ctx);
    ctx.extract.mockResolvedValue(success);
    await retry(ctx, first.id, "retry-key-0005");

    ctx.extract.mockClear();
    ctx.extract.mockResolvedValue(success);
    await expect(retry(ctx, first.id, "retry-key-0006")).rejects.toMatchObject({
      code: "OCR_NOT_RETRYABLE",
      statusCode: 409,
    });
    expect(ctx.extract).not.toHaveBeenCalled();
    expect(ctx.store.jobs).toHaveLength(2);
  });

  it("serializes two different keys on the same receipt and calls the provider once", async () => {
    ctx = setup(true);
    const first = await uploadFailed(ctx);
    ctx.extract.mockClear();
    ctx.extract.mockResolvedValue(success);

    const [a, b] = await Promise.allSettled([
      retry(ctx, first.id, "retry-key-0007"),
      retry(ctx, first.id, "retry-key-0008"),
    ]);

    expect(a.status).toBe("fulfilled");
    if (a.status !== "fulfilled") throw a.reason;
    expect(a.value.status).toBe(200);
    expect((a.value.body as { job: { status: string } }).job.status).toBe("SUCCEEDED");

    expect(b.status).toBe("rejected");
    if (b.status !== "rejected") throw new Error("second retry must lose the claim");
    expect(b.reason).toMatchObject({ code: "OCR_NOT_RETRYABLE", statusCode: 409 });

    expect(ctx.extract).toHaveBeenCalledTimes(1);
    expect(ctx.store.jobs.map((row) => row.attempt)).toEqual([1, 2]);
  });

  it("returns OCR_RETRY_IN_PROGRESS for a latest PROCESSING job without a provider call", async () => {
    const job = await uploadFailed(ctx);
    const row = ctx.store.jobs.find((item) => item.id === job.id);
    if (!row) throw new Error("job fixture missing");
    row.status = "PROCESSING";
    row.errorCode = null;
    ctx.extract.mockClear();

    await expect(retry(ctx, job.id, "retry-key-0009")).rejects.toMatchObject({
      code: "OCR_RETRY_IN_PROGRESS",
      statusCode: 409,
    });
    expect(ctx.extract).not.toHaveBeenCalled();
    expect(ctx.store.jobs).toHaveLength(1);
  });

  it("replays a committed response for the same idempotency key", async () => {
    const job = await uploadFailed(ctx);
    ctx.extract.mockClear();
    ctx.extract.mockResolvedValue(success);

    const first = await retry(ctx, job.id, "retry-key-0010");
    const second = await retry(ctx, job.id, "retry-key-0010");

    expect(second).toEqual(first);
    expect(ctx.extract).toHaveBeenCalledTimes(1);
    expect(ctx.store.jobs.map((row) => row.attempt)).toEqual([1, 2]);
  });

  it("returns OCR_IMAGE_UNAVAILABLE for a missing blob without creating a job", async () => {
    const job = await uploadFailed(ctx);
    ctx.objects.clear();
    ctx.extract.mockClear();

    await expect(retry(ctx, job.id, "retry-key-0011")).rejects.toMatchObject({
      code: "OCR_IMAGE_UNAVAILABLE",
      statusCode: 409,
    });
    expect(ctx.extract).not.toHaveBeenCalled();
    expect(ctx.store.jobs).toHaveLength(1);
    expect(ctx.store.receipts).toHaveLength(1);
    expect(ctx.store.transactions).toHaveLength(0);
  });

  it("returns OCR_IMAGE_UNAVAILABLE for empty or size-mismatched bytes", async () => {
    const job = await uploadFailed(ctx, 6);
    const receipt = ctx.store.receipts[0];
    if (!receipt) throw new Error("receipt fixture missing");
    ctx.extract.mockClear();

    ctx.objects.set(receipt.storageKey, new Uint8Array(5));
    await expect(retry(ctx, job.id, "retry-key-0012")).rejects.toMatchObject({
      code: "OCR_IMAGE_UNAVAILABLE",
      statusCode: 409,
    });

    ctx.objects.set(receipt.storageKey, new Uint8Array(0));
    await expect(retry(ctx, job.id, "retry-key-0013")).rejects.toMatchObject({
      code: "OCR_IMAGE_UNAVAILABLE",
      statusCode: 409,
    });

    expect(ctx.extract).not.toHaveBeenCalled();
    expect(ctx.store.jobs).toHaveLength(1);
  });

  it("returns OCR_IMAGE_UNAVAILABLE when the blob read throws", async () => {
    const job = await uploadFailed(ctx);
    const ledger = createFakeLedger(ctx.store);
    const idempotency = new IdempotencyService(ledger.transaction);
    const unreadable = new OcrService(
      ledger.repos,
      ledger.transaction,
      idempotency,
      { extract: ctx.extract },
      {
        put: async () => {
          throw new Error("put not used");
        },
        get: async () => {
          throw new Error("storage read failed");
        },
      },
    );
    ctx.extract.mockClear();

    await expect(unreadable.retry(actor, job.id, "retry-key-0014")).rejects.toMatchObject({
      code: "OCR_IMAGE_UNAVAILABLE",
      statusCode: 409,
    });
    expect(ctx.extract).not.toHaveBeenCalled();
    expect(ctx.store.jobs).toHaveLength(1);
  });

  it("returns a generic 404 for another uploader, another household, or an unknown job", async () => {
    const job = await uploadFailed(ctx);
    ctx.extract.mockClear();

    await expect(
      ctx.service.retry(otherMember, job.id, "retry-key-0015"),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
    await expect(
      ctx.service.retry(otherHousehold, job.id, "retry-key-0016"),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
    await expect(
      ctx.service.retry(actor, "99999999-9999-4999-8999-999999999999", "retry-key-0017"),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });

    expect(ctx.extract).not.toHaveBeenCalled();
    expect(ctx.store.jobs).toHaveLength(1);
    expect(ctx.store.transactions).toHaveLength(0);
  });

  it("keeps prior FAILED jobs intact when the retry fails again", async () => {
    const job = await uploadFailed(ctx);
    const before = { ...ctx.store.jobs[0] };
    const result = await retry(ctx, job.id, "retry-key-0018");
    const body = result.body as { job: { id: string; status: string; errorCode: string }; draft: null };

    expect(result.status).toBe(200);
    expect(body.job.status).toBe("FAILED");
    expect(body.job.errorCode).toBe("OCR_TIMEOUT");
    expect(body.draft).toBeNull();
    expect(body.job.id).not.toBe(before.id);
    expect(ctx.store.jobs[0]).toMatchObject({
      id: before.id,
      status: "FAILED",
      errorCode: before.errorCode,
      attempt: 1,
    });
    expect(ctx.store.jobs.map((row) => row.attempt)).toEqual([1, 2]);
  });
});
