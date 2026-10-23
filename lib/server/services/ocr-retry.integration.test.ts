/*
  T-012 OCR retry (AC-F3-10..13), DB-backed.

  Runs the real Receipt row lock (`SELECT ... FOR UPDATE`) and the real
  OcrJob.attempt unique index against local PostgreSQL. Gemini and Vercel Blob
  are injected fakes; no external call is made.

  Fixtures use the reserved `qa-t012-<uuid>@test.local` prefix and are cleaned
  children-first by exact id.
*/

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createLedgerRepositories } from "../repositories/ledger";
import { createFakeBlobStore } from "../testing/fakes";
import {
  createIntegrationLedgerTransaction,
  createIntegrationPrisma,
} from "../testing/integration-db";
import type { OcrExtraction, OcrProvider } from "../providers/ocr";
import type { ImageNormalizer } from "./image-normalization";
import { IdempotencyService } from "./idempotency";
import { OcrService, type OcrActor } from "./ocr";

type Fixtures = {
  userId: string;
  householdId: string;
  otherUserId: string;
  email: string;
};

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

const failure: OcrExtraction = { ok: false, errorCode: "OCR_TIMEOUT" };

const passthroughNormalizer: ImageNormalizer = {
  normalize: async (bytes, mimeType) => ({ bytes, mimeType }),
};

async function seedFixtures(prisma: PrismaClient): Promise<Fixtures> {
  const suffix = randomUUID();
  const email = `qa-t012-${suffix}@test.local`;
  const user = await prisma.user.create({
    data: { email, passwordHash: "not-a-real-hash", displayName: "Retry Test" },
  });
  const household = await prisma.household.create({
    data: { name: `Retry Household ${suffix}`, ownerUserId: user.id },
  });
  const other = await prisma.user.create({
    data: {
      email: `qa-t012-other-${suffix}@test.local`,
      passwordHash: "not-a-real-hash",
      displayName: "Retry Other",
    },
  });
  return { userId: user.id, householdId: household.id, otherUserId: other.id, email };
}

async function cleanupFixtures(prisma: PrismaClient, fixtures: Fixtures): Promise<void> {
  await prisma.idempotencyKey.deleteMany({
    where: { userId: { in: [fixtures.userId, fixtures.otherUserId] } },
  });
  await prisma.transaction.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.ocrJob.deleteMany({ where: { receipt: { householdId: fixtures.householdId } } });
  await prisma.receipt.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.membershipEvent.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.membership.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.household.deleteMany({ where: { id: fixtures.householdId } });
  await prisma.user.deleteMany({ where: { id: { in: [fixtures.userId, fixtures.otherUserId] } } });
}

describe("OCR retry DB integration (T-012)", () => {
  let prisma: PrismaClient;
  let fixtures: Fixtures;
  let actor: OcrActor;

  beforeAll(() => {
    prisma = createIntegrationPrisma();
  });

  beforeEach(async () => {
    fixtures = await seedFixtures(prisma);
    actor = { userId: fixtures.userId, householdId: fixtures.householdId };
  });

  afterEach(async () => {
    await cleanupFixtures(prisma, fixtures);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makeOcr(extract: OcrProvider["extract"]) {
    const repos = createLedgerRepositories(prisma);
    const transaction = createIntegrationLedgerTransaction(prisma);
    const idempotency = new IdempotencyService(transaction);
    const blob = createFakeBlobStore();
    const service = new OcrService(
      repos,
      transaction,
      idempotency,
      { extract },
      blob.store,
      passthroughNormalizer,
    );
    return { service, blob };
  }

  function uploadFile(seed: string) {
    const bytes = new TextEncoder().encode(seed);
    return { bytes, mimeType: "image/jpeg", sizeBytes: bytes.byteLength };
  }

  async function uploadFailed(
    service: OcrService,
    seed = `seed-${randomUUID()}`,
  ): Promise<{ id: string; receiptId: string }> {
    const result = await service.upload(actor, uploadFile(seed));
    const body = result.body as { job: { id: string; receiptId: string; status: string } };
    expect(result.status).toBe(200);
    expect(body.job.status).toBe("FAILED");
    return body.job;
  }

  it("allocates attempt 2 in the DB and never creates a Receipt or Transaction", async () => {
    const extract = vi
      .fn<OcrProvider["extract"]>()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(success);
    const { service } = makeOcr(extract);
    const first = await uploadFailed(service);

    const retry = await service.retry(actor, first.id, "it-retry-key-0001");
    expect(retry.status).toBe(200);
    expect((retry.body as { job: { status: string } }).job.status).toBe("SUCCEEDED");

    const jobs = await prisma.ocrJob.findMany({
      where: { receiptId: first.receiptId },
      orderBy: { attempt: "asc" },
    });
    expect(jobs.map((job) => job.attempt)).toEqual([1, 2]);
    expect(jobs[0]).toMatchObject({ id: first.id, status: "FAILED", errorCode: "OCR_TIMEOUT" });
    expect(jobs[1]).toMatchObject({ status: "SUCCEEDED" });

    expect(await prisma.receipt.count({ where: { householdId: fixtures.householdId } })).toBe(1);
    expect(await prisma.transaction.count({ where: { householdId: fixtures.householdId } })).toBe(0);
  });

  it("serializes two different keys on the Receipt row and calls the provider once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let retryEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      retryEntered = resolve;
    });

    const extract = vi.fn<OcrProvider["extract"]>(async () => {
      if (extract.mock.calls.length === 1) return failure;
      retryEntered();
      await gate;
      return success;
    });
    const { service } = makeOcr(extract);
    const first = await uploadFailed(service);

    const one = service.retry(actor, first.id, "it-retry-key-0002");
    await entered;
    const two = service.retry(actor, first.id, "it-retry-key-0003");
    /* Give the second request time to block on the Receipt row lock. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();

    const [a, b] = await Promise.allSettled([one, two]);
    expect(a.status).toBe("fulfilled");
    if (a.status !== "fulfilled") throw a.reason;
    expect(a.value.status).toBe(200);
    expect((a.value.body as { job: { status: string } }).job.status).toBe("SUCCEEDED");

    expect(b.status).toBe("rejected");
    if (b.status !== "rejected") throw new Error("second retry must lose the claim");
    expect(b.reason).toMatchObject({ code: "OCR_NOT_RETRYABLE", statusCode: 409 });

    expect(extract).toHaveBeenCalledTimes(2);
    const jobs = await prisma.ocrJob.findMany({
      where: { receiptId: first.receiptId },
      orderBy: { attempt: "asc" },
    });
    expect(jobs.map((job) => job.attempt)).toEqual([1, 2]);
  });

  it("returns OCR_IMAGE_UNAVAILABLE without a job row or provider call", async () => {
    const extract = vi.fn<OcrProvider["extract"]>().mockResolvedValueOnce(failure);
    const { service, blob } = makeOcr(extract);
    const first = await uploadFailed(service);
    blob.objects.clear();
    extract.mockClear();

    await expect(
      service.retry(actor, first.id, "it-retry-key-0004"),
    ).rejects.toMatchObject({ code: "OCR_IMAGE_UNAVAILABLE", statusCode: 409 });

    expect(extract).not.toHaveBeenCalled();
    expect(await prisma.ocrJob.count({ where: { receiptId: first.receiptId } })).toBe(1);
    expect(await prisma.receipt.count({ where: { householdId: fixtures.householdId } })).toBe(1);
  });

  it("returns a generic 404 for a non-uploader or another household", async () => {
    const extract = vi.fn<OcrProvider["extract"]>().mockResolvedValueOnce(failure);
    const { service } = makeOcr(extract);
    const first = await uploadFailed(service);

    await expect(
      service.retry(
        { userId: fixtures.otherUserId, householdId: fixtures.householdId },
        first.id,
        "it-retry-key-0005",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });

    await expect(
      service.retry(
        { userId: fixtures.userId, householdId: randomUUID() },
        first.id,
        "it-retry-key-0006",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });

    expect(extract).toHaveBeenCalledTimes(1);
    expect(await prisma.ocrJob.count({ where: { receiptId: first.receiptId } })).toBe(1);
  });
});
