/*
  AC-F3-6 receipt dedup, DB-backed (T-008 dev gap closure).

  The unit/route tests use the in-memory fake repository; this suite runs the
  real OcrService through a real interactive transaction against local
  PostgreSQL, so the `receipt` UNIQUE(household_id, content_sha256) and the
  household-scoped `findByHash` are actually exercised. Gemini and Blob are not
  called: the OCR provider and Blob store are injected fake seams.

  Fixtures use the reserved `qa-t008-dev-<uuid>@test.local` prefix and are
  cleaned children-first by exact id; no bulk delete.
*/

import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createLedgerRepositories } from "../repositories/ledger";
import { createFakeBlobStore, createFakeOcrProvider } from "../testing/fakes";
import {
  createIntegrationLedgerTransaction,
  createIntegrationPrisma,
} from "../testing/integration-db";
import { IdempotencyService } from "./idempotency";
import { OcrService } from "./ocr";

type Fixtures = {
  userId: string;
  householdId: string;
  email: string;
  otherUserId: string;
  otherHouseholdId: string;
  otherEmail: string;
};

const draft = {
  merchant: "Pasar Segar",
  totalAmountMinor: 64_800,
  currencyCode: "IDR" as const,
  occurredAt: "2026-10-01",
  category: "food",
  taxAmountMinor: 0,
  confidence: 0.92,
  missingFields: [] as string[],
  notes: null,
};

async function seedFixtures(prisma: PrismaClient): Promise<Fixtures> {
  const suffix = randomUUID();
  const email = `qa-t008-dev-${suffix}@test.local`;
  const user = await prisma.user.create({
    data: { email, passwordHash: "not-a-real-hash", displayName: "Dedup Test A" },
  });
  const household = await prisma.household.create({
    data: { name: `Dedup Household A ${suffix}`, ownerUserId: user.id },
  });

  const otherEmail = `qa-t008-dev-${randomUUID()}@test.local`;
  const otherUser = await prisma.user.create({
    data: { email: otherEmail, passwordHash: "not-a-real-hash", displayName: "Dedup Test B" },
  });
  const otherHousehold = await prisma.household.create({
    data: { name: `Dedup Household B ${suffix}`, ownerUserId: otherUser.id },
  });

  return {
    userId: user.id,
    householdId: household.id,
    email,
    otherUserId: otherUser.id,
    otherHouseholdId: otherHousehold.id,
    otherEmail,
  };
}

/** Children-first, exact-id cleanup (FK RESTRICT); safe to call repeatedly. */
async function cleanupFixtures(prisma: PrismaClient, f: Fixtures): Promise<void> {
  const userIds = [f.userId, f.otherUserId];
  const householdIds = [f.householdId, f.otherHouseholdId];
  await prisma.idempotencyKey.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.transaction.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.ocrJob.deleteMany({ where: { receipt: { householdId: { in: householdIds } } } });
  await prisma.receipt.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.savingsGoal.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.advisorInsight.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdBudget.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.membershipEvent.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.membership.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.invite.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe("OCR receipt dedup DB integration (AC-F3-6)", () => {
  let prisma: PrismaClient;
  let fixtures: Fixtures;

  beforeAll(() => {
    prisma = createIntegrationPrisma();
  });

  beforeEach(async () => {
    fixtures = await seedFixtures(prisma);
  });

  afterEach(async () => {
    await cleanupFixtures(prisma, fixtures);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makeOcr(): {
    ocr: OcrService;
    extract: ReturnType<typeof createFakeOcrProvider>["extract"];
    put: ReturnType<typeof createFakeBlobStore>["put"];
  } {
    const repos = createLedgerRepositories(prisma);
    const transaction = createIntegrationLedgerTransaction(prisma);
    const idempotency = new IdempotencyService(transaction);
    const { provider, extract } = createFakeOcrProvider({ ok: true, model: "fake-model", raw: draft });
    const { store: blob, put } = createFakeBlobStore();
    return { ocr: new OcrService(repos, transaction, idempotency, provider, blob), extract, put };
  }

  function fileFor(seed: string) {
    const bytes = new TextEncoder().encode(seed);
    return { bytes, mimeType: "image/png", sizeBytes: bytes.byteLength };
  }

  it("returns 409 with the existing job and never processes the same content twice", async () => {
    const { ocr, extract, put } = makeOcr();
    const actor = { userId: fixtures.userId, householdId: fixtures.householdId };
    const file = fileFor(`same-household-${randomUUID()}`);

    const first = await ocr.upload(actor, file);
    expect(first.status).toBe(200);
    const firstBody = first.body as { job: { id: string; status: string }; draft: { merchant: string } };
    expect(firstBody.job.status).toBe("SUCCEEDED");
    expect(firstBody.draft.merchant).toBe("Pasar Segar");
    expect(extract).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);

    const duplicate = await ocr.upload(actor, file);
    expect(duplicate.status).toBe(409);
    const duplicateBody = duplicate.body as {
      error: { code: string };
      job: { id: string } | null;
      draft: { merchant: string } | null;
    };
    expect(duplicateBody.error.code).toBe("DUPLICATE_RECEIPT");
    expect(duplicateBody.job?.id).toBe(firstBody.job.id);
    expect(duplicateBody.draft?.merchant).toBe("Pasar Segar");
    /* The provider and Blob seams are untouched on the dedup path. */
    expect(extract).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);

    /* DB facts: exactly one receipt + one job for the content in the household. */
    expect(await prisma.receipt.count({ where: { householdId: fixtures.householdId } })).toBe(1);
    expect(await prisma.ocrJob.count({ where: { receipt: { householdId: fixtures.householdId } } })).toBe(1);
    const digest = createHash("sha256").update(file.bytes).digest("hex");
    expect(
      await prisma.receipt.count({ where: { householdId: fixtures.householdId, contentSha256: digest } }),
    ).toBe(1);
  });

  it("allows identical content in a different household", async () => {
    const { ocr, extract, put } = makeOcr();
    const file = fileFor(`cross-household-${randomUUID()}`);
    const actorA = { userId: fixtures.userId, householdId: fixtures.householdId };
    const actorB = { userId: fixtures.otherUserId, householdId: fixtures.otherHouseholdId };

    const inA = await ocr.upload(actorA, file);
    const inB = await ocr.upload(actorB, file);

    expect(inA.status).toBe(200);
    expect(inB.status).toBe(200);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(2);
    expect(await prisma.receipt.count({ where: { householdId: fixtures.householdId } })).toBe(1);
    expect(await prisma.receipt.count({ where: { householdId: fixtures.otherHouseholdId } })).toBe(1);
  });

  it("without an idempotency key executes normally and stores no key row (AC-F3-8)", async () => {
    const { ocr, extract } = makeOcr();
    const actor = { userId: fixtures.userId, householdId: fixtures.householdId };

    const first = await ocr.upload(actor, fileFor(`no-key-a-${randomUUID()}`));
    const second = await ocr.upload(actor, fileFor(`no-key-b-${randomUUID()}`));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(await prisma.receipt.count({ where: { householdId: fixtures.householdId } })).toBe(2);
    expect(await prisma.idempotencyKey.count({ where: { userId: fixtures.userId } })).toBe(0);
  });
});
