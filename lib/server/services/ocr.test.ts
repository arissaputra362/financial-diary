import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RECEIPT_BYTES, OCR_CONFIDENCE_THRESHOLD, OcrService } from "./ocr";
import { IdempotencyService } from "./idempotency";
import { MAX_NORMALIZED_EDGE, createSharpImageNormalizer, type ImageNormalizer } from "./image-normalization";
import {
  createFakeBlobStore,
  createFakeLedger,
  createFakeOcrProvider,
  createFakeStore,
  type FakeStore,
} from "../testing/fakes";
import type { OcrExtraction } from "../providers/ocr";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const actor = { userId: USER, householdId: HOUSEHOLD };

const draft = {
  merchant: "Toko Sinar",
  totalAmountMinor: 64_800,
  currencyCode: "IDR" as const,
  occurredAt: "2026-10-01",
  category: "food",
  taxAmountMinor: 0,
  confidence: 0.92,
  missingFields: [] as string[],
  notes: null,
};

function file(size = 100, mimeType = "image/jpeg") {
  return { bytes: new Uint8Array(size).fill(7), mimeType, sizeBytes: size, filename: "struk.jpg" };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createFakeNormalizer(mode: "pass" | "throw" | { bytes: Uint8Array; mimeType: string }) {
  const normalize = vi.fn(async (bytes: Uint8Array, mimeType: string) => {
    if (mode === "throw") throw new Error("transform failed");
    if (mode === "pass") return { bytes, mimeType };
    return mode;
  });
  const normalizer: ImageNormalizer = { normalize };
  return { normalizer, normalize };
}

function extractArgs(extract: ReturnType<typeof createFakeOcrProvider>["extract"]) {
  const call = extract.mock.calls[0];
  if (!call) throw new Error("provider was not called");
  const [bytes, mimeType] = call as unknown as [Uint8Array, string];
  return { bytes, mimeType };
}

function putArgs(put: ReturnType<typeof createFakeBlobStore>["put"]) {
  const call = put.mock.calls[0];
  if (!call) throw new Error("blob was not called");
  return call as unknown as [Uint8Array, string, string];
}

function setup(
  extraction: OcrExtraction | Error,
  blobFail = false,
  normalizer: ImageNormalizer = createFakeNormalizer("pass").normalizer,
) {
  const store = createFakeStore();
  const { repos, transaction } = createFakeLedger(store);
  const { provider, extract } = createFakeOcrProvider(extraction);
  const { store: blob, put } = createFakeBlobStore(blobFail);
  const service = new OcrService(repos, transaction, new IdempotencyService(transaction), provider, blob, normalizer);
  return { service, store: store as FakeStore, extract, put };
}

const success: OcrExtraction = { ok: true, model: "fake-model", raw: draft };

describe("OcrService", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup(success);
  });

  it("returns a SUCCEEDED job + draft and never creates a transaction (AC-F3-4)", async () => {
    const result = await ctx.service.upload(actor, file());
    expect(result.status).toBe(200);
    const body = result.body as { job: { status: string }; draft: typeof draft };
    expect(body.job.status).toBe("SUCCEEDED");
    expect(body.draft.totalAmountMinor).toBe(64_800);
    expect(body.draft.occurredAt).toBe("2026-10-01");
    expect(ctx.store.receipts).toHaveLength(1);
    expect(ctx.store.receipts[0]?.storageKey).toContain(HOUSEHOLD);
    expect(ctx.store.order).not.toContain("transaction.create");
  });

  it("maps provider failures to OCR namespace codes with HTTP 200 (AC-F3-5)", async () => {
    for (const code of ["OCR_TIMEOUT", "OCR_RATE_LIMITED", "OCR_INVALID_OUTPUT", "OCR_MODEL_UNAVAILABLE"] as const) {
      const isolated = setup({ ok: false, errorCode: code });
      const result = await isolated.service.upload(actor, file());
      expect(result.status).toBe(200);
      const body = result.body as { job: { status: string; errorCode: string }; draft: null };
      expect(body.job.status).toBe("FAILED");
      expect(body.job.errorCode).toBe(code);
      expect(body.draft).toBeNull();
    }
  });

  it("treats an unexpected provider crash as OCR_MODEL_UNAVAILABLE (fail-closed)", async () => {
    const isolated = setup(new Error("boom"));
    const result = await isolated.service.upload(actor, file());
    const body = result.body as { job: { status: string; errorCode: string } };
    expect(body.job.status).toBe("FAILED");
    expect(body.job.errorCode).toBe("OCR_MODEL_UNAVAILABLE");
  });

  it("sends the normalized copy to Gemini while blob + dedup keep the original (WO-008)", async () => {
    const original = file();
    const normalizedBytes = new Uint8Array(50).fill(3);
    const { normalizer } = createFakeNormalizer({ bytes: normalizedBytes, mimeType: "image/png" });
    const isolated = setup(success, false, normalizer);

    const result = await isolated.service.upload(actor, original);
    expect(result.status).toBe(200);

    const sent = extractArgs(isolated.extract);
    expect(Buffer.from(sent.bytes)).toEqual(Buffer.from(normalizedBytes));
    expect(sent.mimeType).toBe("image/png");

    const stored = putArgs(isolated.put);
    expect(Buffer.from(stored[0])).toEqual(Buffer.from(original.bytes));
    expect(stored[2]).toBe("image/jpeg");

    const receipt = isolated.store.receipts[0];
    expect(receipt?.contentSha256).toBe(sha256(original.bytes));
    expect(receipt?.sizeBytes).toBe(original.sizeBytes);
    expect(receipt?.mimeType).toBe("image/jpeg");
  });

  it("falls back to the original bytes when normalization fails (WO-008)", async () => {
    const { normalizer, normalize } = createFakeNormalizer("throw");
    const isolated = setup(success, false, normalizer);
    const original = file();

    const result = await isolated.service.upload(actor, original);
    const body = result.body as { job: { status: string } };
    expect(result.status).toBe(200);
    expect(body.job.status).toBe("SUCCEEDED");
    expect(normalize).toHaveBeenCalledOnce();

    const sent = extractArgs(isolated.extract);
    expect(Buffer.from(sent.bytes)).toEqual(Buffer.from(original.bytes));
    expect(sent.mimeType).toBe("image/jpeg");
    expect(isolated.store.receipts[0]?.contentSha256).toBe(sha256(original.bytes));
  });

  it("keeps the typed OCR error when normalization and the provider both fail (WO-008)", async () => {
    const { normalizer } = createFakeNormalizer("throw");
    const isolated = setup(new Error("provider down"), false, normalizer);

    const result = await isolated.service.upload(actor, file());
    const body = result.body as { job: { status: string; errorCode: string } };
    expect(result.status).toBe(200);
    expect(body.job.status).toBe("FAILED");
    expect(body.job.errorCode).toBe("OCR_MODEL_UNAVAILABLE");
  });

  it("passes a real downscaled copy to Gemini and stores the original (WO-008)", async () => {
    const large = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const original = {
      bytes: new Uint8Array(large),
      mimeType: "image/jpeg",
      sizeBytes: large.byteLength,
      filename: "big.jpg",
    };
    const isolated = setup(success, false, createSharpImageNormalizer());

    const result = await isolated.service.upload(actor, original);
    expect(result.status).toBe(200);

    const sent = extractArgs(isolated.extract);
    expect(sent.mimeType).toBe("image/jpeg");
    const sentMeta = await sharp(Buffer.from(sent.bytes)).metadata();
    expect(sentMeta.width).toBeLessThanOrEqual(MAX_NORMALIZED_EDGE);
    expect(sentMeta.height).toBeLessThanOrEqual(MAX_NORMALIZED_EDGE);
    expect((sentMeta.width ?? 0) / (sentMeta.height ?? 1)).toBeCloseTo(1.5, 2);

    const stored = putArgs(isolated.put);
    expect(Buffer.from(stored[0])).toEqual(Buffer.from(original.bytes));
    expect(isolated.store.receipts[0]?.contentSha256).toBe(sha256(original.bytes));
    expect(isolated.store.receipts[0]?.sizeBytes).toBe(original.sizeBytes);
  });

  it("does not normalize on the duplicate path (WO-008)", async () => {
    const { normalizer, normalize } = createFakeNormalizer("pass");
    const isolated = setup(success, false, normalizer);
    const upload = file();
    isolated.store.receipts.push({
      id: "44444444-4444-4444-8444-444444444444",
      householdId: HOUSEHOLD,
      uploadedByUserId: USER,
      contentSha256: sha256(upload.bytes),
      mimeType: "image/jpeg",
      sizeBytes: upload.sizeBytes,
      storageKey: "receipts/existing",
    });

    const result = await isolated.service.upload(actor, upload);
    expect(result.status).toBe(409);
    expect(normalize).not.toHaveBeenCalled();
  });

  it("rejects untrusted model output at the Zod boundary (AC-F3-5, D-12)", async () => {
    const isolated = setup({ ok: true, model: "fake", raw: { ...draft, totalAmountMinor: -1 } });
    const result = await isolated.service.upload(actor, file());
    const body = result.body as { job: { status: string; errorCode: string }; draft: null };
    expect(body.job.status).toBe("FAILED");
    expect(body.job.errorCode).toBe("OCR_INVALID_OUTPUT");
    expect(body.draft).toBeNull();
  });

  it("flags low confidence and keeps missing fields empty (AC-F3-7)", async () => {
    const isolated = setup({
      ok: true,
      model: "fake",
      raw: { ...draft, confidence: OCR_CONFIDENCE_THRESHOLD - 0.2, merchant: "Toko", missingFields: ["merchant"] },
    });
    const result = await isolated.service.upload(actor, file());
    const body = result.body as { draft: { confidence: number; merchant: null; missingFields: string[] } };
    expect(body.draft.confidence).toBeLessThan(OCR_CONFIDENCE_THRESHOLD);
    expect(body.draft.merchant).toBeNull();
    expect(body.draft.missingFields).toContain("merchant");
  });

  it("rejects files above 4MB and disallowed mime with FILE_INVALID (AC-F3-4, A-02/A-21)", async () => {
    await expect(
      ctx.service.upload(actor, { ...file(), sizeBytes: MAX_RECEIPT_BYTES + 1 }),
    ).rejects.toMatchObject({ code: "FILE_INVALID", statusCode: 422 });
    await expect(ctx.service.upload(actor, file(100, "image/gif"))).rejects.toMatchObject({
      code: "FILE_INVALID",
      statusCode: 422,
    });
    /* Exactly at the boundary passes. */
    const atBoundary = await ctx.service.upload(actor, file(MAX_RECEIPT_BYTES));
    expect(atBoundary.status).toBe(200);
  });

  it("claims the idempotency key before running dedup (AC-F3-8, A-11)", async () => {
    await ctx.service.upload(actor, file(), "key-aaaaaaaa");
    const claimAt = ctx.store.order.indexOf("idempotency.claim");
    const dedupAt = ctx.store.order.indexOf("receipt.findByHash");
    expect(claimAt).toBeGreaterThanOrEqual(0);
    expect(dedupAt).toBeGreaterThan(claimAt);
  });

  it("returns 409 DUPLICATE_RECEIPT + the existing job without reprocessing (AC-F3-6)", async () => {
    const upload = file();
    const digest = sha256(upload.bytes);
    ctx.store.receipts.push({
      id: "44444444-4444-4444-8444-444444444444",
      householdId: HOUSEHOLD,
      uploadedByUserId: USER,
      contentSha256: digest,
      mimeType: "image/jpeg",
      sizeBytes: upload.sizeBytes,
      storageKey: "receipts/existing",
    });
    ctx.store.jobs.push({
      id: "55555555-5555-4555-8555-555555555555",
      receiptId: "44444444-4444-4444-8444-444444444444",
      status: "SUCCEEDED",
      attempt: 1,
      model: "fake",
      resultJson: draft,
      confidence: 0.92,
      errorCode: null,
      createdAt: new Date(),
      completedAt: new Date(),
    });

    const result = await ctx.service.upload(actor, upload);
    expect(result.status).toBe(409);
    const body = result.body as { error: { code: string }; job: { id: string }; draft: { merchant: string } };
    expect(body.error.code).toBe("DUPLICATE_RECEIPT");
    expect(body.job.id).toBe("55555555-5555-4555-8555-555555555555");
    expect(body.draft.merchant).toBe("Toko Sinar");
    expect(ctx.put).not.toHaveBeenCalled();
    expect(ctx.extract).not.toHaveBeenCalled();
  });

  it("replays a committed 409 for the same key + payload (A-11)", async () => {
    const upload = file();
    ctx.store.receipts.push({
      id: "44444444-4444-4444-8444-444444444444",
      householdId: HOUSEHOLD,
      uploadedByUserId: USER,
      contentSha256: sha256(upload.bytes),
      mimeType: "image/jpeg",
      sizeBytes: upload.sizeBytes,
      storageKey: "receipts/existing",
    });
    const first = await ctx.service.upload(actor, upload, "key-cccccccc");
    const second = await ctx.service.upload(actor, upload, "key-cccccccc");
    expect(first.status).toBe(409);
    expect(second).toEqual(first);
  });

  it("allows the same content in a different household (AC-F3-6)", async () => {
    const upload = file();
    ctx.store.receipts.push({
      id: "66666666-6666-4666-8666-666666666666",
      householdId: "22222222-2222-4222-8222-222222222222",
      uploadedByUserId: USER,
      contentSha256: sha256(upload.bytes),
      mimeType: "image/jpeg",
      sizeBytes: upload.sizeBytes,
      storageKey: "receipts/other-household",
    });
    const result = await ctx.service.upload(actor, upload);
    expect(result.status).toBe(200);
    expect(ctx.put).toHaveBeenCalledOnce();
  });

  it("getJob returns the persisted draft or null for failures", async () => {
    const result = await ctx.service.upload(actor, file());
    const jobId = (result.body as { job: { id: string } }).job.id;
    const fetched = await ctx.service.getJob(actor, jobId);
    expect((fetched.body as { draft: { merchant: string } }).draft.merchant).toBe("Toko Sinar");
    const missing = ctx.service.getJob(actor, "99999999-9999-4999-8999-999999999999");
    await expect(missing).rejects.toMatchObject({ statusCode: 404 });
  });

  it("gets the latest job by receipt without widening uploader access", async () => {
    const result = await ctx.service.upload(actor, file());
    const body = result.body as { job: { receiptId: string; id: string } };

    const latest = await ctx.service.getLatestJobForReceipt(actor, body.job.receiptId);
    expect((latest.body as { job: { id: string } }).job.id).toBe(body.job.id);

    await expect(
      ctx.service.getLatestJobForReceipt({
        userId: "44444444-4444-4444-8444-444444444444",
        householdId: HOUSEHOLD,
      }, body.job.receiptId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});