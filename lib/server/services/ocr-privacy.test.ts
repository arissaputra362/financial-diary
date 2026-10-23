import { beforeEach, describe, expect, it } from "vitest";
import { IdempotencyService } from "./idempotency";
import { OcrService, type OcrActor } from "./ocr";
import { createFakeBlobStore, createFakeLedger, createFakeOcrProvider, createFakeStore, type FakeStore } from "../testing/fakes";
import type { LedgerRepositories } from "../repositories/ledger";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const W_SHARED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const uploader: OcrActor = { userId: OWNER, householdId: HOUSEHOLD, role: "OWNER" };
const other: OcrActor = { userId: OTHER, householdId: HOUSEHOLD, role: "MEMBER" };

function setup(): { service: OcrService; store: FakeStore; repos: LedgerRepositories; put: ReturnType<typeof createFakeBlobStore>["put"] } {
  const store = createFakeStore();
  store.wallets.push({
    id: W_SHARED,
    householdId: HOUSEHOLD,
    createdByUserId: OWNER,
    createdByDisplayName: "Owner",
    scope: "SHARING",
    name: "Keluarga",
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
  const { repos, transaction } = createFakeLedger(store);
  const { provider } = createFakeOcrProvider({
    ok: true,
    model: "fake",
    raw: { merchant: "Toko", totalAmountMinor: 10_000, currencyCode: "IDR", occurredAt: "2026-10-01", category: "food", taxAmountMinor: 0, confidence: 0.9, missingFields: [], notes: null },
  });
  const blob = createFakeBlobStore();
  const service = new OcrService(repos, transaction, new IdempotencyService(transaction), provider, blob.store);
  return { service, store, repos, put: blob.put };
}

function file(bytes: number[]) {
  return { bytes: new Uint8Array(bytes), mimeType: "image/jpeg", sizeBytes: bytes.length };
}

async function upload(ctx: ReturnType<typeof setup>, actor: OcrActor, bytes: number[]) {
  const result = await ctx.service.upload(actor, file(bytes));
  const body = result.body as { job: { id: string; receiptId: string; receiptSharedWithHousehold: boolean } };
  return { result, job: body.job };
}

describe("OCR privacy (C-19, C-28, C-29, AC-F6-10)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("keeps the OCR job/draft uploader-only before and after save (C-29)", async () => {
    const { job } = await upload(ctx, uploader, [1, 2, 3]);
    await expect(ctx.service.getJob(other, job.id)).rejects.toMatchObject({ statusCode: 404 });
    const mine = await ctx.service.getJob(uploader, job.id);
    expect(mine.status).toBe(200);
    expect((mine.body as { job: { receiptSharedWithHousehold: boolean } }).job.receiptSharedWithHousehold).toBe(false);
  });

  it("returns a generic duplicate for another uploader with no job/draft/receiptId (C-19)", async () => {
    await upload(ctx, uploader, [9, 9, 9]);
    const duplicate = await ctx.service.upload(other, file([9, 9, 9]));
    expect(duplicate.status).toBe(409);
    const serialized = JSON.stringify(duplicate.body);
    expect(duplicate.body).toMatchObject({ error: { code: "DUPLICATE_RECEIPT" } });
    expect(serialized).not.toMatch(/job|draft|receiptId|uploader|receiptSharedWithHousehold/i);
  });

  it("lets the same uploader reuse their own job (C-19)", async () => {
    const { job } = await upload(ctx, uploader, [4, 4, 4]);
    const retry = await ctx.service.upload(uploader, file([4, 4, 4]));
    expect(retry.status).toBe(409);
    const body = retry.body as { job: { id: string } | null; draft: unknown };
    expect(body.job?.id).toBe(job.id);
    expect(body.draft).not.toBeNull();
  });

  it("serves the receipt image to the uploader, and to the household once a SHARING link exists (C-28/C-30)", async () => {
    const { job } = await upload(ctx, uploader, [7, 7, 7]);
    /* Only uploader before any link. */
    expect(await ctx.service.getReceiptImage(other, job.receiptId)).toBeNull();
    const own = await ctx.service.getReceiptImage(uploader, job.receiptId);
    expect(own?.mimeType).toBe("image/jpeg");

    /* A SHARING-linked transaction makes the image household-visible. */
    ctx.store.transactions.push({
      id: crypto.randomUUID(),
      householdId: HOUSEHOLD,
      createdByUserId: OWNER,
      type: "MONEY_OUT",
      amountMinor: 10_000,
      currencyCode: "IDR",
      category: "food",
      merchant: null,
      note: null,
      occurredAt: new Date(),
      source: "OCR",
      receiptId: job.receiptId,
      transferGroupId: null,
      walletId: W_SHARED,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await ctx.service.getReceiptImage(other, job.receiptId)).not.toBeNull();

    const afterSave = await ctx.service.getJob(uploader, job.id);
    expect((afterSave.body as { job: { receiptSharedWithHousehold: boolean } }).job.receiptSharedWithHousehold).toBe(true);
  });

  it("still counts a soft-deleted SHARING link for the image union (C-28)", async () => {
    const { job } = await upload(ctx, uploader, [8, 8, 8]);
    ctx.store.transactions.push({
      id: crypto.randomUUID(),
      householdId: HOUSEHOLD,
      createdByUserId: OWNER,
      type: "MONEY_OUT",
      amountMinor: 10_000,
      currencyCode: "IDR",
      category: "food",
      merchant: null,
      note: null,
      occurredAt: new Date(),
      source: "OCR",
      receiptId: job.receiptId,
      transferGroupId: null,
      walletId: W_SHARED,
      deletedAt: new Date(),
      deletedByUserId: OWNER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await ctx.service.getReceiptImage(other, job.receiptId)).not.toBeNull();
  });
});
