/*
  OcrService (AC-F3-4..7, A-02/10/11/21, ADR-003/008).

  The OCR endpoint NEVER creates a transaction: it stores the receipt + job and
  returns a review draft. Dedup is by sha256 within the household; the
  idempotency key is claimed before the dedup (A-11). Model failures stay HTTP
  200 with a FAILED job + namespace code (A-10, D-12).
*/

import { createHash } from "node:crypto";
import {
  MAX_RECEIPT_BYTES,
  OCR_CONFIDENCE_THRESHOLD,
  ocrDraftSchema,
  ocrRetryPath,
  ocrUploadMetaSchema,
  type OcrDraft,
} from "../contracts/ocr";
import { CATEGORIES } from "../contracts/transactions";
import {
  badRequest,
  fileInvalid,
  notFound,
  ocrImageUnavailable,
  ocrNotRetryable,
  ocrRetryInProgress,
} from "../errors";
import type { LedgerRepositories, OcrJobRecord, ReceiptRecord } from "../repositories/ledger";
import type { OcrDraftDTO, OcrJobDTO, OcrMissingField } from "@/types/api";
import type { BlobStore } from "../providers/blob";
import type { OcrExtraction, OcrProvider } from "../providers/ocr";
import { computeRequestHash, IdempotencyService } from "./idempotency";
import { createSharpImageNormalizer, type ImageNormalizer } from "./image-normalization";
import type { LedgerTransaction, ServiceResult } from "./types";

const OCR_PATH = "/api/ocr/receipts";

export type OcrUploadFile = {
  bytes: Uint8Array;
  mimeType: string;
  sizeBytes: number;
  filename?: string;
};

export type OcrActor = { userId: string; householdId: string; role?: string };

export type ReceiptImageResult = { mimeType: string; stream: ReadableStream<Uint8Array> };

class StorageUnavailableError extends Error {
  constructor() {
    super("Receipt storage is unavailable.");
    this.name = "StorageUnavailableError";
  }
}

export class OcrService {
  constructor(
    private readonly repos: LedgerRepositories,
    private readonly transaction: LedgerTransaction,
    private readonly idempotency: IdempotencyService,
    private readonly provider: OcrProvider,
    private readonly blob: BlobStore,
    private readonly normalizer: ImageNormalizer = createSharpImageNormalizer(),
  ) {}

  async upload(actor: OcrActor, file: OcrUploadFile, idempotencyKey?: string): Promise<ServiceResult> {
    const meta = ocrUploadMetaSchema.safeParse({ mimeType: file.mimeType, sizeBytes: file.sizeBytes });
    if (!meta.success) {
      throw fileInvalid(meta.error.issues[0]?.message ?? "File tidak bisa diproses.");
    }
    const contentSha256 = sha256Hex(file.bytes);
    const run = (repos: LedgerRepositories) => this.persist(repos, actor, file, contentSha256);

    if (idempotencyKey) {
      const hash = computeRequestHash("POST", OCR_PATH, {
        contentSha256,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      });
      return this.idempotency.run(actor.userId, idempotencyKey, hash, run);
    }
    return this.transaction(run);
  }

  async getJob(actor: OcrActor, jobId: string): Promise<ServiceResult> {
    /* C-29: OCR job + draft are uploader-only, before and after save. */
    const job = await this.repos.ocrJob.findByIdForActor(actor, jobId);
    if (!job) throw notFound("Struk tidak ditemukan.");
    const sharedWithHousehold = await this.repos.receipt.isSharedWithHousehold(job.receiptId);
    return { status: 200, body: { job: toOcrJobDTO(job, sharedWithHousehold), draft: storedDraft(job) } };
  }

  async getLatestJobForReceipt(actor: OcrActor, receiptId: string): Promise<ServiceResult> {
    const receipt = await this.repos.receipt.findById(actor.householdId, receiptId);
    if (!receipt || receipt.uploadedByUserId !== actor.userId) {
      throw notFound("Struk tidak ditemukan.");
    }
    const job = await this.repos.ocrJob.findByReceiptId(actor.householdId, receiptId);
    if (!job) throw notFound("Struk tidak ditemukan.");
    const sharedWithHousehold = await this.repos.receipt.isSharedWithHousehold(job.receiptId);
    return { status: 200, body: { job: toOcrJobDTO(job, sharedWithHousehold), draft: storedDraft(job) } };
  }

  /**
   * T-012 retry (AC-F3-10..13): re-read the private stored bytes and create one
   * new attempt for the latest FAILED job of the original uploader.
   *
   * The Receipt row lock is taken before the decision, so two retries for the
   * same receipt serialize; the pre-lock job read is only the ACL gate. The
   * provider and the new OcrJob run inside the same idempotent transaction as
   * the upload path. This method never creates a Receipt or a Transaction and
   * never mutates a prior job.
   */
  async retry(actor: OcrActor, jobId: string, idempotencyKey: string): Promise<ServiceResult> {
    if (!idempotencyKey) throw badRequest("INVALID_IDEMPOTENCY_KEY", "Kunci idempotensi wajib diisi.");
    const hash = computeRequestHash("POST", ocrRetryPath(jobId), {});
    return this.idempotency.run(actor.userId, idempotencyKey, hash, (repos) =>
      this.retryWithin(repos, actor, jobId),
    );
  }

  private async retryWithin(
    repos: LedgerRepositories,
    actor: OcrActor,
    jobId: string,
  ): Promise<ServiceResult> {
    /* ACL gate before the lock; a missing/foreign/non-uploader job is one generic 404. */
    const target = await repos.ocrJob.findByIdForActor(actor, jobId);
    if (!target) throw notFound("Struk tidak ditemukan.");

    const receipt = await repos.receipt.lockByIdForActor(actor, target.receiptId);
    if (!receipt) throw notFound("Struk tidak ditemukan.");

    /*
      Re-read the latest attempt AFTER the lock (READ COMMITTED): the pre-lock
      read must never decide whether a retry is allowed. `findByReceiptId` is
      ordered by attempt DESC.
    */
    const latest = await repos.ocrJob.findByReceiptId(actor.householdId, receipt.id);
    if (!latest) throw notFound("Struk tidak ditemukan.");
    if (latest.id !== jobId) throw ocrNotRetryable();
    if (latest.status === "PROCESSING") throw ocrRetryInProgress();
    if (latest.status !== "FAILED") throw ocrNotRetryable();

    /* Lazy private read: no job and no provider call when the bytes are unusable. */
    const file = await this.readStoredReceipt(receipt);
    if (!file) throw ocrImageUnavailable();

    let created: { id: string; status: string };
    try {
      created = await repos.ocrJob.create({
        receiptId: receipt.id,
        status: "PROCESSING",
        attempt: latest.attempt + 1,
      });
    } catch (error) {
      /* Partial unique PROCESSING / attempt race: another claim owns the receipt. */
      if (isOcrJobConcurrencyViolation(error)) throw ocrRetryInProgress();
      throw error;
    }

    const extraction = await this.extract(file);
    const sharedWithHousehold = await repos.receipt.isSharedWithHousehold(receipt.id);

    if (!extraction.ok) {
      const job = await repos.ocrJob.update(created.id, {
        status: "FAILED",
        errorCode: extraction.errorCode,
        completedAt: new Date(),
      });
      return { status: 200, body: { job: toOcrJobDTO(job, sharedWithHousehold), draft: null } };
    }

    const parsed = ocrDraftSchema.safeParse(extraction.raw);
    if (!parsed.success) {
      /* Untrusted model output rejected at the boundary (D-12). */
      const job = await repos.ocrJob.update(created.id, {
        status: "FAILED",
        errorCode: "OCR_INVALID_OUTPUT",
        model: extraction.model,
        completedAt: new Date(),
      });
      return { status: 200, body: { job: toOcrJobDTO(job, sharedWithHousehold), draft: null } };
    }

    const draft = normalizeDraft(parsed.data);
    const job = await repos.ocrJob.update(created.id, {
      status: "SUCCEEDED",
      model: extraction.model,
      resultJson: draft,
      confidence: draft.confidence,
      completedAt: new Date(),
    });
    return { status: 200, body: { job: toOcrJobDTO(job, sharedWithHousehold), draft } };
  }

  /**
   * New authenticated image route (C-30/A-46): returns private Blob bytes for an
   * actor allowed by the image-union predicate. Null → generic 404. Never
   * returns job/draft/flag/transaction rows or a Blob URL.
   */
  async getReceiptImage(actor: OcrActor, receiptId: string): Promise<ReceiptImageResult | null> {
    const receipt = await this.repos.receipt.findImageByIdForActor(actor, receiptId);
    if (!receipt) return null;
    const blob = await this.blob.get(receipt.storageKey);
    if (!blob) return null;
    return { mimeType: receipt.mimeType, stream: blob.stream };
  }

  private async persist(
    repos: LedgerRepositories,
    actor: OcrActor,
    file: OcrUploadFile,
    contentSha256: string,
  ): Promise<ServiceResult> {
    const existingReceipt = await repos.receipt.findByHash(actor.householdId, contentSha256);
    if (existingReceipt) {
      return this.duplicateResponse(repos, actor, existingReceipt);
    }

    const storageKey = `receipts/${actor.householdId}/${contentSha256}`;
    try {
      await this.blob.put(file.bytes, storageKey, file.mimeType);
    } catch {
      throw new StorageUnavailableError();
    }

    let receipt: { id: string };
    try {
      receipt = await repos.receipt.create({
        householdId: actor.householdId,
        uploadedByUserId: actor.userId,
        contentSha256,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageKey,
      });
    } catch (error) {
      /* Race (A-47): a concurrent upload won the unique (household, hash). */
      if (!isUniqueConstraintError(error)) throw error;
      const winner = await repos.receipt.findByHash(actor.householdId, contentSha256);
      if (!winner) throw error;
      return this.duplicateResponse(repos, actor, winner);
    }
    const created = await repos.ocrJob.create({ receiptId: receipt.id, status: "PROCESSING" });

    const extraction = await this.extract(file);
    if (!extraction.ok) {
      const job = await repos.ocrJob.update(created.id, {
        status: "FAILED",
        errorCode: extraction.errorCode,
        completedAt: new Date(),
      });
      return { status: 200, body: { job: toOcrJobDTO(job, false), draft: null } };
    }

    const parsed = ocrDraftSchema.safeParse(extraction.raw);
    if (!parsed.success) {
      /* Untrusted model output rejected at the boundary (D-12). */
      const job = await repos.ocrJob.update(created.id, {
        status: "FAILED",
        errorCode: "OCR_INVALID_OUTPUT",
        model: extraction.model,
        completedAt: new Date(),
      });
      return { status: 200, body: { job: toOcrJobDTO(job, false), draft: null } };
    }

    const draft = normalizeDraft(parsed.data);
    const job = await repos.ocrJob.update(created.id, {
      status: "SUCCEEDED",
      model: extraction.model,
      resultJson: draft,
      confidence: draft.confidence,
      completedAt: new Date(),
    });
    return { status: 200, body: { job: toOcrJobDTO(job, false), draft } };
  }

  /**
   * A-47 duplicate branching: a different uploader gets a generic 409 with no
   * job/draft/receiptId/uploader detail; the same uploader reuses their own job.
   */
  private async duplicateResponse(
    repos: LedgerRepositories,
    actor: OcrActor,
    receipt: { id: string; uploadedByUserId: string },
  ): Promise<ServiceResult> {
    const error = {
      code: "DUPLICATE_RECEIPT",
      message: "Struk ini sudah pernah diproses.",
      fieldErrors: null,
    };
    if (receipt.uploadedByUserId !== actor.userId) {
      /* Other uploader: generic body only (C-19/A-47). */
      return { status: 409, body: { error } };
    }
    const existingJob = await repos.ocrJob.findByReceiptId(actor.householdId, receipt.id);
    const shared = await repos.receipt.isSharedWithHousehold(receipt.id);
    return {
      status: 409,
      body: {
        error,
        job: existingJob ? toOcrJobDTO(existingJob, shared) : null,
        draft: existingJob ? storedDraft(existingJob) : null,
      },
    };
  }

  /**
   * Lazy read of the private Blob bytes for a retry (AC-F3-11/12). Null means
   * missing, unreadable, empty, over the upload limit, or length mismatch with
   * the stored `size_bytes`. The caller turns null into OCR_IMAGE_UNAVAILABLE
   * before any job row or provider call exists.
   */
  private async readStoredReceipt(receipt: ReceiptRecord): Promise<OcrUploadFile | null> {
    if (
      !Number.isInteger(receipt.sizeBytes) ||
      receipt.sizeBytes <= 0 ||
      receipt.sizeBytes > MAX_RECEIPT_BYTES
    ) {
      return null;
    }
    let stored: { stream: ReadableStream<Uint8Array> } | null;
    try {
      stored = await this.blob.get(receipt.storageKey);
    } catch {
      return null;
    }
    if (!stored) return null;

    const bytes = await readStreamBytes(stored.stream, MAX_RECEIPT_BYTES + 1);
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength !== receipt.sizeBytes) return null;
    return { bytes, mimeType: receipt.mimeType, sizeBytes: bytes.byteLength };
  }

  private async extract(file: OcrUploadFile): Promise<OcrExtraction> {
    const payload = await this.derivedImage(file);
    try {
      return await this.provider.extract(payload.bytes, payload.mimeType);
    } catch {
      /* Fail-closed: provider crash is a model-unavailable condition, not a 500. */
      return { ok: false, errorCode: "OCR_MODEL_UNAVAILABLE" };
    }
  }

  /**
   * Derived image for the single provider call (WO-008). The original uploaded
   * bytes stay the source of truth for SHA-256 dedup, size metadata, and private
   * Blob storage; only this copy goes to Gemini. On any transform error the
   * original (already validated) bytes are used instead, so a bad transform
   * never becomes an untyped 500 and never blocks an otherwise valid upload.
   */
  private async derivedImage(file: OcrUploadFile): Promise<{ bytes: Uint8Array; mimeType: string }> {
    try {
      return await this.normalizer.normalize(file.bytes, file.mimeType);
    } catch {
      return { bytes: file.bytes, mimeType: file.mimeType };
    }
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toOcrJobDTO(job: OcrJobRecord, receiptSharedWithHousehold: boolean): OcrJobDTO {
  return {
    id: job.id,
    receiptId: job.receiptId,
    status: job.status,
    errorCode: (job.errorCode as OcrJobDTO["errorCode"]) ?? null,
    model: job.model,
    confidence: job.confidence,
    receiptSharedWithHousehold,
  };
}

/** Prisma unique-constraint violation (P2002) on the receipt dedup key (A-47). */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** P2002 constraint target(s), normalized to strings for index-name checks. */
function uniqueTargets(error: unknown): string[] {
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  return [];
}

/**
 * Only the OCR claim indexes may become a retry-in-progress response:
 * `ocr_job_receipt_id_attempt_key` (attempt allocation) or the partial
 * `ocr_job_receipt_processing_key` (one PROCESSING job per receipt). Any other
 * P2002 is rethrown rather than misreported.
 */
function isOcrJobConcurrencyViolation(error: unknown): boolean {
  if (!isUniqueConstraintError(error)) return false;
  return uniqueTargets(error).some(
    (target) =>
      target === "attempt" ||
      target === "receipt_id" ||
      target.includes("attempt") ||
      target.includes("processing"),
  );
}

/** Reads a byte stream up to `limit`; null when the stream errors or exceeds it. */
async function readStreamBytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = stream.getReader();
  } catch {
    return null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > limit) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* A cancelled stream may already be released. */
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Read a persisted draft back, re-validating it (untrusted DB payload). */
function storedDraft(job: OcrJobRecord): OcrDraftDTO | null {
  if (job.status !== "SUCCEEDED") return null;
  const parsed = ocrDraftSchema.safeParse(job.resultJson);
  return parsed.success ? normalizeDraft(parsed.data) : null;
}

/**
 * Fields the model could not read stay empty (no invented values, AC-F3-7).
 * `missingFields` is the union of the model's list and every null required
 * field, so the review form can require them before saving.
 */
export function normalizeDraft(raw: OcrDraft): OcrDraftDTO {
  const missing = new Set<OcrMissingField>(raw.missingFields);
  const merchant = missing.has("merchant") ? null : raw.merchant;
  const totalAmountMinor = missing.has("totalAmountMinor") ? null : raw.totalAmountMinor;
  const occurredAt = missing.has("occurredAt") ? null : raw.occurredAt;
  const category =
    raw.category && (CATEGORIES as readonly string[]).includes(raw.category) && !missing.has("category")
      ? raw.category
      : null;

  if (!merchant) missing.add("merchant");
  if (totalAmountMinor === null) missing.add("totalAmountMinor");
  if (!occurredAt) missing.add("occurredAt");
  if (!category) missing.add("category");

  return {
    merchant,
    totalAmountMinor,
    currencyCode: raw.currencyCode,
    occurredAt,
    category,
    taxAmountMinor: raw.taxAmountMinor,
    confidence: raw.confidence,
    missingFields: [...missing],
    notes: raw.notes,
  };
}

export { MAX_RECEIPT_BYTES, OCR_CONFIDENCE_THRESHOLD };
