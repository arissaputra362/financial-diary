import type { Db } from "./types";

/*
  Ledger repositories (feat-transactions-ocr, feat-goals-advisor, feat-trash-restore,
  feat-dashboard). ONE mandatory rule (ADR-006, AC T-003): every method takes a
  householdId scope, and active queries ALWAYS exclude deleted_at != null. Trash and
  restore are separate methods that never mix with active reads.
*/

export interface HouseholdScope {
  householdId: string;
}

export interface ListFilters {
  type?: "MONEY_IN" | "MONEY_OUT" | "TRANSFER";
  source?: "MANUAL" | "OCR";
  from?: Date;
  to?: Date;
  cursor?: string | null;
  limit?: number;
}

export interface Paged<T> {
  rows: T[];
  nextCursor: string | null;
}

export interface TransactionRepository {
  create(data: {
    householdId: string;
    createdByUserId: string;
    type: "MONEY_IN" | "MONEY_OUT" | "TRANSFER";
    amountMinor: number;
    category?: string | null;
    merchant?: string | null;
    note?: string | null;
    occurredAt: Date;
    source: "MANUAL" | "OCR";
    receiptId?: string | null;
    transferGroupId?: string | null;
  }): Promise<{ id: string; type: string; amountMinor: number; transferGroupId: string | null }>;
  /** Both legs in ONE interactive transaction (ERD §3.7 invariant). */
  createTransferPair(
    householdId: string,
    createdByUserId: string,
    outLeg: { amountMinor: number; category?: string | null; merchant?: string | null; note?: string | null; occurredAt: Date },
    inLeg: { amountMinor: number; category?: string | null; merchant?: string | null; note?: string | null; occurredAt: Date },
  ): Promise<Array<{ id: string; type: string; amountMinor: number; transferGroupId: string | null }>>;
  findById(householdId: string, id: string): Promise<{ id: string; householdId: string; deletedAt: Date | null } | null>;
  listActive(householdId: string, filters?: ListFilters): Promise<Paged<{ id: string; occurredAt: Date }>>;
  sumByType(householdId: string, range: { type: "MONEY_IN" | "MONEY_OUT"; from: Date; to: Date }): Promise<number>;
  listByDay(householdId: string, range: { from: Date; to: Date }): Promise<Array<{ date: Date; amountMinor: number }>>;
  softDelete(householdId: string, id: string, userId: string): Promise<{ alreadyDeleted: boolean }>;
  restore(householdId: string, id: string): Promise<{ alreadyActive: boolean }>;
  listTrash(householdId: string, cursor?: string | null, limit?: number): Promise<Paged<{ id: string; deletedAt: Date | null }>>;
}

export interface GoalRepository {
  create(data: { householdId: string; createdByUserId: string; name: string; targetAmountMinor: number; deadline?: Date | null }): Promise<{ id: string; name: string; targetAmountMinor: number; savedAmountMinor: number }>;
  listActive(householdId: string): Promise<Array<{ id: string; name: string; targetAmountMinor: number; savedAmountMinor: number; deadline: Date | null }>>;
  findById(householdId: string, id: string): Promise<{ id: string; householdId: string; deletedAt: Date | null; savedAmountMinor: number } | null>;
  /** Atomic conditional increment; rowcount 0 means rejected (A-16). */
  incrementSaved(householdId: string, id: string, delta: number): Promise<number>;
  softDelete(householdId: string, id: string, userId: string): Promise<{ alreadyDeleted: boolean }>;
  restore(householdId: string, id: string): Promise<{ alreadyActive: boolean }>;
  listTrash(householdId: string, cursor?: string | null, limit?: number): Promise<Paged<{ id: string; deletedAt: Date | null }>>;
}

export interface ReceiptRepository {
  findByHash(householdId: string, contentSha256: string): Promise<{ id: string; householdId: string } | null>;
  create(data: { householdId: string; uploadedByUserId: string; contentSha256: string; mimeType: string; sizeBytes: number; storageKey: string }): Promise<{ id: string }>;
}

export interface OcrJobRepository {
  create(data: { receiptId: string; status: "PROCESSING" | "SUCCEEDED" | "FAILED"; model?: string | null; resultJson?: unknown; confidence?: number | null; errorCode?: string | null; completedAt?: Date | null }): Promise<{ id: string; status: string }>;
  findById(householdId: string, id: string): Promise<{ id: string; status: string; errorCode: string | null } | null>;
  update(id: string, patch: { status?: "PROCESSING" | "SUCCEEDED" | "FAILED"; model?: string | null; resultJson?: unknown; confidence?: number | null; errorCode?: string | null; completedAt?: Date | null }): Promise<{ id: string; status: string }>;
}

export interface AdvisorInsightRepository {
  findLatestUnexpired(householdId: string, periodStart: Date, periodEnd: Date): Promise<{ id: string; headline: string } | null>;
  create(data: { householdId: string; requestedByUserId: string; sourcePeriodStart: Date; sourcePeriodEnd: Date; model: string; headline: string; summary: string; actionsJson: unknown; limitations?: string | null; expiresAt: Date }): Promise<{ id: string }>;
  prune(householdId: string, keep: number): Promise<void>;
}

export interface BudgetRepository {
  findByPeriod(householdId: string, periodStart: Date): Promise<{ id: string; amountMinor: number; periodStart: Date } | null>;
  upsert(householdId: string, periodStart: Date, amountMinor: number, userId: string): Promise<{ id: string; amountMinor: number }>;
}

export interface IdempotencyRepository {
  /** Insert-as-claim (unique constraint); returns the existing row on conflict. */
  claim(userId: string, key: string, requestHash: string, ttlHours: number): Promise<{ claimed: boolean; existing?: { requestHash: string; responseStatus: number | null; responseBody: unknown } }>;
  complete(userId: string, key: string, responseStatus: number, responseBody: unknown): Promise<void>;
  purgeExpired(userId: string): Promise<void>;
}

const ACTIVE = { deletedAt: null } as const;

export function createTransactionRepository(db: Db): TransactionRepository {
  return {
    async create(data) {
      const row = await db.transaction.create({ data });
      return { id: row.id, type: row.type, amountMinor: row.amountMinor, transferGroupId: row.transferGroupId };
    },
    async createTransferPair(householdId, createdByUserId, outLeg, inLeg) {
      const transferGroupId = crypto.randomUUID();
      return db.$transaction(async (tx) => {
        const out = await tx.transaction.create({
          data: { ...outLeg, householdId, createdByUserId, type: "MONEY_OUT", source: "MANUAL", transferGroupId },
        });
        const inn = await tx.transaction.create({
          data: { ...inLeg, householdId, createdByUserId, type: "MONEY_IN", source: "MANUAL", transferGroupId },
        });
        return [
          { id: out.id, type: out.type, amountMinor: out.amountMinor, transferGroupId: out.transferGroupId },
          { id: inn.id, type: inn.type, amountMinor: inn.amountMinor, transferGroupId: inn.transferGroupId },
        ];
      });
    },
    async findById(householdId, id) {
      /* Extended-unique where: cross-household id resolves to null (ADR-006). */
      return db.transaction.findFirst({ where: { id, householdId } });
    },
    async listActive(householdId, filters = {}) {
      const where = {
        householdId,
        ...ACTIVE,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.from || filters.to
          ? { occurredAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
          : {}),
      };
      const limit = filters.limit ?? 20;
      const rows = await db.transaction.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > limit;
      return { rows: rows.slice(0, limit), nextCursor: hasMore ? rows[limit - 1]?.id ?? null : null };
    },
    async sumByType(householdId, range) {
      const result = await db.transaction.aggregate({
        where: { householdId, ...ACTIVE, type: range.type, occurredAt: { gte: range.from, lte: range.to } },
        _sum: { amountMinor: true },
      });
      return result._sum.amountMinor ?? 0;
    },
    async listByDay(householdId, range) {
      const rows = await db.transaction.groupBy({
        by: ["occurredAt"],
        where: { householdId, ...ACTIVE, type: "MONEY_OUT", occurredAt: { gte: range.from, lte: range.to } },
        _sum: { amountMinor: true },
      });
      return rows.map((row) => ({ date: row.occurredAt, amountMinor: row._sum.amountMinor ?? 0 }));
    },
    async softDelete(householdId, id, userId) {
      /* Conditional update + rowcount: idempotent trash (A-17). */
      const result = await db.transaction.updateMany({
        where: { id, householdId, deletedAt: null },
        data: { deletedAt: new Date(), deletedByUserId: userId },
      });
      return { alreadyDeleted: result.count === 0 };
    },
    async restore(householdId, id) {
      const result = await db.transaction.updateMany({
        where: { id, householdId, deletedAt: { not: null } },
        data: { deletedAt: null, deletedByUserId: null },
      });
      return { alreadyActive: result.count === 0 };
    },
    async listTrash(householdId, cursor, limit = 20) {
      const rows = await db.transaction.findMany({
        where: { householdId, deletedAt: { not: null } },
        orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > limit;
      return { rows: rows.slice(0, limit), nextCursor: hasMore ? rows[limit - 1]?.id ?? null : null };
    },
  };
}

export function createGoalRepository(db: Db): GoalRepository {
  return {
    async create(data) {
      const row = await db.savingsGoal.create({ data });
      return { id: row.id, name: row.name, targetAmountMinor: row.targetAmountMinor, savedAmountMinor: row.savedAmountMinor };
    },
    async listActive(householdId) {
      return db.savingsGoal.findMany({
        where: { householdId, ...ACTIVE },
        orderBy: [{ deadline: "asc" }, { id: "asc" }],
      });
    },
    async findById(householdId, id) {
      return db.savingsGoal.findFirst({ where: { id, householdId } });
    },
    async incrementSaved(householdId, id, delta) {
      /*
        Atomic conditional increment (A-16 / D-18): the WHERE clause rejects a
        negative result; rowcount 0 means the update did not happen.
      */
      const result = await db.savingsGoal.updateMany({
        where: { id, householdId, deletedAt: null, savedAmountMinor: { gte: -delta } },
        data: { savedAmountMinor: { increment: delta } },
      });
      return result.count;
    },
    async softDelete(householdId, id, userId) {
      const result = await db.savingsGoal.updateMany({
        where: { id, householdId, deletedAt: null },
        data: { deletedAt: new Date(), deletedByUserId: userId },
      });
      return { alreadyDeleted: result.count === 0 };
    },
    async restore(householdId, id) {
      const result = await db.savingsGoal.updateMany({
        where: { id, householdId, deletedAt: { not: null } },
        data: { deletedAt: null, deletedByUserId: null },
      });
      return { alreadyActive: result.count === 0 };
    },
    async listTrash(householdId, cursor, limit = 20) {
      const rows = await db.savingsGoal.findMany({
        where: { householdId, deletedAt: { not: null } },
        orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > limit;
      return { rows: rows.slice(0, limit), nextCursor: hasMore ? rows[limit - 1]?.id ?? null : null };
    },
  };
}

export function createReceiptRepository(db: Db): ReceiptRepository {
  return {
    async findByHash(householdId, contentSha256) {
      return db.receipt.findUnique({ where: { householdId_contentSha256: { householdId, contentSha256 } } });
    },
    async create(data) {
      const row = await db.receipt.create({ data });
      return { id: row.id };
    },
  };
}

export function createOcrJobRepository(db: Db): OcrJobRepository {
  return {
    async create(data) {
      const row = await db.ocrJob.create({ data: data as never });
      return { id: row.id, status: row.status };
    },
    async findById(householdId, id) {
      /* Job is scoped through its receipt's household (join on receipt). */
      const row = await db.ocrJob.findFirst({
        where: { id, receipt: { householdId } },
      });
      return row ? { id: row.id, status: row.status, errorCode: row.errorCode } : null;
    },
    async update(id, patch) {
      const row = await db.ocrJob.update({ where: { id }, data: patch as never });
      return { id: row.id, status: row.status };
    },
  };
}

export function createAdvisorInsightRepository(db: Db): AdvisorInsightRepository {
  return {
    async findLatestUnexpired(householdId, periodStart, periodEnd) {
      const row = await db.advisorInsight.findFirst({
        where: {
          householdId,
          sourcePeriodStart: periodStart,
          sourcePeriodEnd: periodEnd,
          expiresAt: { gt: new Date() },
        },
        orderBy: { generatedAt: "desc" },
      });
      return row;
    },
    async create(data) {
      const row = await db.advisorInsight.create({ data: data as never });
      return { id: row.id };
    },
    async prune(householdId, keep) {
      const rows = await db.advisorInsight.findMany({
        where: { householdId },
        orderBy: { generatedAt: "desc" },
        skip: keep,
        select: { id: true },
      });
      if (rows.length === 0) return;
      await db.advisorInsight.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    },
  };
}

export function createBudgetRepository(db: Db): BudgetRepository {
  return {
    async findByPeriod(householdId, periodStart) {
      return db.householdBudget.findUnique({
        where: { householdId_periodStart: { householdId, periodStart } },
      });
    },
    async upsert(householdId, periodStart, amountMinor, userId) {
      const row = await db.householdBudget.upsert({
        where: { householdId_periodStart: { householdId, periodStart } },
        create: { householdId, periodStart, amountMinor, createdByUserId: userId },
        update: { amountMinor },
      });
      return { id: row.id, amountMinor: row.amountMinor };
    },
  };
}

export function createIdempotencyRepository(db: Db): IdempotencyRepository {
  return {
    async claim(userId, key, requestHash, ttlHours) {
      /*
        Insert-as-claim (A-11 / D-2): the UNIQUE(user_id, key) constraint is the
        claim. On conflict, re-read and compare the request hash.
      */
      const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
      try {
        await db.idempotencyKey.create({ data: { userId, key, requestHash, expiresAt } });
        return { claimed: true };
      } catch {
        const existing = await db.idempotencyKey.findUnique({
          where: { userId_key: { userId, key } },
          select: { requestHash: true, responseStatus: true, responseBody: true },
        });
        return { claimed: false, existing: existing ?? undefined };
      }
    },
    async complete(userId, key, responseStatus, responseBody) {
      await db.idempotencyKey.update({
        where: { userId_key: { userId, key } },
        data: { responseStatus, responseBody: responseBody as never },
      });
    },
    async purgeExpired(userId) {
      await db.idempotencyKey.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    },
  };
}