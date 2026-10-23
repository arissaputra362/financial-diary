import type { Db } from "./types";
import { notFound } from "../errors";
import {
  createInstitutionRepository,
  type InstitutionRepository,
} from "./institutions";

/*
  Ledger repositories (feat-transactions-ocr, feat-goals-advisor, feat-trash-restore,
  feat-dashboard). ONE mandatory rule (ADR-006, AC T-003): every method takes a
  householdId scope, and active queries ALWAYS exclude deleted_at != null. Trash and
  restore are separate methods that never mix with active reads.
*/

export interface HouseholdScope {
  householdId: string;
}

/*
  Wallet-scoped reads/mutations receive the actor, not just `householdId`
  (A-38): `householdId` alone cannot enforce PERSONAL privacy. `role` is the
  household membership role (OWNER | MEMBER) used by the archive/transfer rules.
*/
export interface WalletActor {
  userId: string;
  householdId: string;
  /** Household membership role (OWNER | MEMBER). Defaults to non-owner when absent. */
  role?: string;
}

/**
 * Prisma `where` fragment for the A-38 visibility predicate: same household AND
 * (SHARING OR created by the actor). Callers pass this into `wallet`/`wallet.is`.
 */
export function visibleWalletWhere(actor: WalletActor): {
  householdId: string;
  OR: Array<{ scope: "SHARING" } | { createdByUserId: string }>;
} {
  return {
    householdId: actor.householdId,
    OR: [{ scope: "SHARING" }, { createdByUserId: actor.userId }],
  };
}

export type WalletScopeValue = "PERSONAL" | "SHARING";

/** Resolved wallet institution label (T-011 / A-56). */
export interface WalletInstitutionRecord {
  kind: "OFFICIAL" | "CUSTOM";
  id: string;
  name: string;
  /** Custom rows only: the private owner, used to null the DTO id for others. */
  ownerUserId: string | null;
}

export interface WalletRecord {
  id: string;
  householdId: string;
  createdByUserId: string;
  /** Creator display name, included for the SHARING card footer (A-49). */
  createdByDisplayName: string | null;
  scope: WalletScopeValue;
  name: string;
  purpose: string | null;
  openingBalanceMinor: number;
  officialInstitutionId: string | null;
  customInstitutionId: string | null;
  /** Joined label; null = manual. Read WITHOUT an active/archived filter. */
  institution: WalletInstitutionRecord | null;
  archivedAt: Date | null;
  archivedByUserId: string | null;
  systemKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One wallet plus its server-computed balance (opening + active in - active out). */
export interface WalletWithBalance extends WalletRecord {
  balanceMinor: number;
}

export interface WalletListFilters {
  view?: "active" | "archived" | "all";
}


/** Persisted row types. `TRANSFER` is input-only (AC-F3-3), never stored. */
export type StoredTransactionType = "MONEY_IN" | "MONEY_OUT";

export interface ListFilters {
  type?: StoredTransactionType;
  source?: "MANUAL" | "OCR";
  from?: Date;
  to?: Date;
  walletId?: string;
  cursor?: string | null;
  limit?: number;
}

/**
 * Aggregate scope: null/undefined = all wallets; "SHARING" excludes PERSONAL
 * (A-45). `walletOwnerUserId` narrows the filter to wallets created by that
 * user, which is how the personal scope never sees another member's PERSONAL
 * wallets (T-015).
 */
export interface AggregateScope {
  walletScope?: WalletScopeValue;
  walletOwnerUserId?: string;
}

export interface Paged<T> {
  rows: T[];
  nextCursor: string | null;
}

/** Full ledger row returned by create/list/trash (used to build DTOs). */
export interface TransactionRecord {
  id: string;
  householdId: string;
  createdByUserId: string;
  type: StoredTransactionType;
  amountMinor: number;
  currencyCode: string;
  category: string | null;
  merchant: string | null;
  note: string | null;
  occurredAt: Date;
  source: "MANUAL" | "OCR";
  receiptId: string | null;
  transferGroupId: string | null;
  walletId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Ledger row joined with its wallet's visibility fields (A-38/A-39 redaction). */
export interface TransactionWithWallet extends TransactionRecord {
  walletScope: WalletScopeValue;
  walletCreatedByUserId: string;
  walletName: string;
}

export interface TransactionRepository {
  create(data: {
    householdId: string;
    createdByUserId: string;
    type: StoredTransactionType;
    amountMinor: number;
    category?: string | null;
    merchant?: string | null;
    note?: string | null;
    occurredAt: Date;
    source: "MANUAL" | "OCR";
    receiptId?: string | null;
    transferGroupId?: string | null;
    walletId: string;
  }): Promise<TransactionRecord>;
  /** Both legs in ONE interactive transaction (ERD §3.7 invariant). */
  createTransferPair(
    householdId: string,
    createdByUserId: string,
    outLeg: { amountMinor: number; category?: string | null; merchant?: string | null; note?: string | null; occurredAt: Date; walletId: string },
    inLeg: { amountMinor: number; category?: string | null; merchant?: string | null; note?: string | null; occurredAt: Date; walletId: string },
  ): Promise<TransactionRecord[]>;
  /** Wallet-visibility filtered (A-38); foreign/private → null → 404. */
  findById(actor: WalletActor, id: string): Promise<TransactionRecord | null>;
  /** Internal household-scoped read WITHOUT wallet visibility (pair resolution). */
  findByIdAnyWallet(householdId: string, id: string): Promise<TransactionRecord | null>;
  listActive(actor: WalletActor, filters?: ListFilters): Promise<Paged<TransactionRecord>>;
  /** All legs sharing a transfer_group_id, household-scoped (A-40). */
  findGroupLegs(householdId: string, transferGroupId: string): Promise<TransactionRecord[]>;
  /**
   * Transfer groups that contain at least one leg the actor cannot see — i.e.
   * cross-scope transfers whose private side must be redacted (A-39).
   */
  privateGroupIdsForActor(actor: WalletActor, groupIds: string[]): Promise<Set<string>>;
  softDelete(actor: WalletActor, id: string, userId: string): Promise<{ alreadyDeleted: boolean }>;
  restore(actor: WalletActor, id: string): Promise<{ alreadyActive: boolean }>;
  /** Atomic pair trash/restore over (household_id, transfer_group_id) (A-40). */
  softDeleteGroup(householdId: string, transferGroupId: string, userId: string): Promise<number>;
  restoreGroup(householdId: string, transferGroupId: string): Promise<number>;
  listTrash(actor: WalletActor, cursor?: string | null, limit?: number): Promise<Paged<TransactionRecord>>;
  sumByType(householdId: string, range: { type: "MONEY_IN" | "MONEY_OUT"; from: Date; to: Date }, scope?: AggregateScope): Promise<number>;
  listByDay(householdId: string, range: { from: Date; to: Date }, scope?: AggregateScope): Promise<Array<{ date: Date; amountMinor: number }>>;
}

export interface WalletRepository {
  create(data: {
    householdId: string;
    createdByUserId: string;
    scope: WalletScopeValue;
    name: string;
    purpose?: string | null;
    openingBalanceMinor: number;
    officialInstitutionId?: string | null;
    customInstitutionId?: string | null;
    systemKey?: string | null;
  }): Promise<WalletRecord>;
  /** A-38 filtered; `active` = archived_at IS NULL. Sorted SHARING then name. */
  list(actor: WalletActor, view: "active" | "archived" | "all"): Promise<WalletRecord[]>;
  findById(actor: WalletActor, id: string): Promise<WalletRecord | null>;
  /** Internal household-scoped lookup without wallet visibility (migration/repo seams). */
  findByIdAnyWallet(householdId: string, id: string): Promise<WalletRecord | null>;
  /** name/purpose/opening/institution only; the type has no `scope` (C-31). */
  update(
    actor: WalletActor,
    id: string,
    patch: {
      name?: string;
      purpose?: string | null;
      openingBalanceMinor?: number;
      officialInstitutionId?: string | null;
      customInstitutionId?: string | null;
    },
  ): Promise<WalletRecord>;
  setArchived(actor: WalletActor, id: string, archived: boolean, byUserId: string): Promise<WalletRecord>;
  /** Row-lock the wallet (`SELECT ... FOR UPDATE`) inside the caller's transaction (A-42). */
  lockWallet(id: string): Promise<WalletRecord | null>;
  /**
   * True when ANY transaction row references the wallet, including trashed rows
   * and a single transfer leg; used to lock the opening balance (A-42/C-21).
   */
  hasTransactions(walletId: string): Promise<boolean>;
  /** Per-wallet balances = opening + Σ active MONEY_IN − Σ active MONEY_OUT. */
  balances(householdId: string): Promise<Array<{ walletId: string; balanceMinor: number; transactionCount: number }>>;
  /** Idempotent migrated default wallet (system_key = 'legacy_default', A-48). */
  ensureMigratedDefault(householdId: string, ownerUserId: string): Promise<WalletRecord>;
}

/**
 * Full persisted goal row (T-007). T-003 declared narrow projections; the goal
 * DTO needs the full row, so the declared shapes return the whole record — the
 * implementations (Prisma `findMany`/`create` without `select`) already do.
 */
export interface GoalRecord {
  id: string;
  householdId: string;
  createdByUserId: string;
  name: string;
  targetAmountMinor: number;
  savedAmountMinor: number;
  currencyCode: string;
  deadline: Date | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalRepository {
  create(data: { householdId: string; createdByUserId: string; name: string; targetAmountMinor: number; deadline?: Date | null }): Promise<GoalRecord>;
  listActive(householdId: string): Promise<GoalRecord[]>;
  findById(householdId: string, id: string): Promise<GoalRecord | null>;
  /** Atomic conditional increment; rowcount 0 means rejected (A-16). */
  incrementSaved(householdId: string, id: string, delta: number): Promise<number>;
  softDelete(householdId: string, id: string, userId: string): Promise<{ alreadyDeleted: boolean }>;
  restore(householdId: string, id: string): Promise<{ alreadyActive: boolean }>;
  listTrash(householdId: string, cursor?: string | null, limit?: number): Promise<Paged<GoalRecord>>;
}

export interface ReceiptRecord {
  id: string;
  householdId: string;
  uploadedByUserId: string;
  contentSha256: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

export interface ReceiptRepository {
  findByHash(householdId: string, contentSha256: string): Promise<ReceiptRecord | null>;
  findById(householdId: string, id: string): Promise<ReceiptRecord | null>;
  create(data: { householdId: string; uploadedByUserId: string; contentSha256: string; mimeType: string; sizeBytes: number; storageKey: string }): Promise<{ id: string }>;
  /**
   * T-012 serialization gate: row-lock the receipt (`SELECT ... FOR UPDATE`)
   * inside the caller's transaction, scoped to the household and uploader.
   * Null means missing, foreign household, or non-uploader (generic 404).
   */
  lockByIdForActor(actor: WalletActor, id: string): Promise<ReceiptRecord | null>;
  /**
   * Image/Blob union predicate (C-28/A-46): uploader, or the receipt is linked
   * to at least one transaction whose wallet is visible to the actor. The union
   * includes soft-deleted links. Never exposes a linked transaction row.
   */
  findImageByIdForActor(actor: WalletActor, id: string): Promise<ReceiptRecord | null>;
  /**
   * Server-computed share flag for the uploader (A-46): true when any linked
   * transaction (including a soft-deleted link) points to a SHARING wallet.
   */
  isSharedWithHousehold(receiptId: string): Promise<boolean>;
}

export interface OcrJobRecord {
  id: string;
  receiptId: string;
  status: "PROCESSING" | "SUCCEEDED" | "FAILED";
  /** Per-receipt trial order (1..n); internal, not part of OcrJobDTO. */
  attempt: number;
  model: string | null;
  resultJson: unknown;
  confidence: number | null;
  errorCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface OcrJobRepository {
  create(data: { receiptId: string; status: "PROCESSING" | "SUCCEEDED" | "FAILED"; attempt?: number; model?: string | null; resultJson?: unknown; confidence?: number | null; errorCode?: string | null; completedAt?: Date | null }): Promise<{ id: string; status: string }>;
  findById(householdId: string, id: string): Promise<OcrJobRecord | null>;
  /** Uploader-only (C-29): never widened by the receipt-image union. */
  findByIdForActor(actor: WalletActor, id: string): Promise<OcrJobRecord | null>;
  /** Latest job for a receipt by `attempt DESC` (T-012), scoped through its household. */
  findByReceiptId(householdId: string, receiptId: string): Promise<OcrJobRecord | null>;
  update(id: string, patch: { status?: "PROCESSING" | "SUCCEEDED" | "FAILED"; model?: string | null; resultJson?: unknown; confidence?: number | null; errorCode?: string | null; completedAt?: Date | null }): Promise<OcrJobRecord>;
}

/** Full persisted insight row; the cache DTO needs every field. */
export interface AdvisorInsightRecord {
  id: string;
  householdId: string;
  requestedByUserId: string;
  sourcePeriodStart: Date;
  sourcePeriodEnd: Date;
  model: string;
  headline: string;
  summary: string;
  actionsJson: unknown;
  limitations: string | null;
  generatedAt: Date;
  expiresAt: Date;
}

export interface AdvisorInsightRepository {
  findLatestUnexpired(householdId: string, periodStart: Date, periodEnd: Date): Promise<AdvisorInsightRecord | null>;
  /** `generatedAt` is explicit so the DTO timestamp equals the persisted one. */
  create(data: { householdId: string; requestedByUserId: string; sourcePeriodStart: Date; sourcePeriodEnd: Date; model: string; headline: string; summary: string; actionsJson: unknown; limitations?: string | null; generatedAt: Date; expiresAt: Date }): Promise<{ id: string }>;
  prune(householdId: string, keep: number): Promise<void>;
}

export interface BudgetRepository {
  findByPeriod(householdId: string, periodStart: Date): Promise<{ id: string; amountMinor: number; periodStart: Date } | null>;
  upsert(householdId: string, periodStart: Date, amountMinor: number, userId: string): Promise<{ id: string; amountMinor: number }>;
}

/**
 * Personal budget repository (T-015 / ERD §3.12b). Every read/write is keyed by
 * both `householdId` and `userId`; the caller always passes the session user, so
 * there is no path to another member's row.
 */
export interface PersonalBudgetRepository {
  findByPeriod(householdId: string, userId: string, periodStart: Date): Promise<{ id: string; amountMinor: number; periodStart: Date } | null>;
  upsert(householdId: string, userId: string, periodStart: Date, amountMinor: number, createdByUserId: string): Promise<{ id: string; amountMinor: number }>;
}

export interface IdempotencyRepository {
  /** Insert-as-claim (unique constraint); returns the existing row on conflict. */
  claim(userId: string, key: string, requestHash: string, ttlHours: number): Promise<{ claimed: boolean; existing?: { requestHash: string; responseStatus: number | null; responseBody: unknown } }>;
  complete(userId: string, key: string, responseStatus: number, responseBody: unknown): Promise<void>;
  purgeExpired(userId: string): Promise<void>;
}

const ACTIVE = { deletedAt: null } as const;

export function createTransactionRepository(db: Db): TransactionRepository {
  /* A-38 wallet visibility predicate applied at the query level. */
  const visibility = (actor: WalletActor) => ({ wallet: { is: visibleWalletWhere(actor) } });
  const scopeFilter = (scope?: AggregateScope) => {
    if (!scope?.walletScope && !scope?.walletOwnerUserId) return {};
    return {
      wallet: {
        is: {
          ...(scope.walletScope ? { scope: scope.walletScope } : {}),
          ...(scope.walletOwnerUserId ? { createdByUserId: scope.walletOwnerUserId } : {}),
        },
      },
    };
  };

  return {
    async create(data) {
      return db.transaction.create({ data });
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
        return [out, inn];
      });
    },
    async findById(actor, id) {
      /* Extended-unique where + wallet visibility: foreign/private → null → 404. */
      return db.transaction.findFirst({
        where: { id, householdId: actor.householdId, ...visibility(actor) },
      });
    },
    async findByIdAnyWallet(householdId, id) {
      return db.transaction.findFirst({ where: { id, householdId } });
    },
    async listActive(actor, filters = {}) {
      const where = {
        householdId: actor.householdId,
        ...ACTIVE,
        ...visibility(actor),
        ...(filters.walletId ? { walletId: filters.walletId } : {}),
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
    async findGroupLegs(householdId, transferGroupId) {
      return db.transaction.findMany({ where: { householdId, transferGroupId } });
    },
    async privateGroupIdsForActor(actor, groupIds) {
      if (groupIds.length === 0) return new Set<string>();
      const rows = await db.transaction.findMany({
        where: {
          householdId: actor.householdId,
          transferGroupId: { in: groupIds },
          NOT: { wallet: { is: visibleWalletWhere(actor) } },
        },
        select: { transferGroupId: true },
      });
      return new Set(rows.map((row) => row.transferGroupId).filter((id): id is string => id !== null));
    },
    async softDelete(actor, id, userId) {
      /* Conditional update + rowcount: idempotent trash (A-17), wallet-visible only. */
      const result = await db.transaction.updateMany({
        where: { id, householdId: actor.householdId, deletedAt: null, ...visibility(actor) },
        data: { deletedAt: new Date(), deletedByUserId: userId },
      });
      return { alreadyDeleted: result.count === 0 };
    },
    async restore(actor, id) {
      const result = await db.transaction.updateMany({
        where: { id, householdId: actor.householdId, deletedAt: { not: null }, ...visibility(actor) },
        data: { deletedAt: null, deletedByUserId: null },
      });
      return { alreadyActive: result.count === 0 };
    },
    async softDeleteGroup(householdId, transferGroupId, userId) {
      /* Atomic pair: both legs in one statement (A-40). */
      const result = await db.transaction.updateMany({
        where: { householdId, transferGroupId, deletedAt: null },
        data: { deletedAt: new Date(), deletedByUserId: userId },
      });
      return result.count;
    },
    async restoreGroup(householdId, transferGroupId) {
      const result = await db.transaction.updateMany({
        where: { householdId, transferGroupId, deletedAt: { not: null } },
        data: { deletedAt: null, deletedByUserId: null },
      });
      return result.count;
    },
    async listTrash(actor, cursor, limit = 20) {
      const rows = await db.transaction.findMany({
        where: { householdId: actor.householdId, deletedAt: { not: null }, ...visibility(actor) },
        orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > limit;
      return { rows: rows.slice(0, limit), nextCursor: hasMore ? rows[limit - 1]?.id ?? null : null };
    },
    async sumByType(householdId, range, scope) {
      /*
        Transfer legs carry a transferGroupId and must never count as spending
        (AC-F2-4). `scope.walletScope = "SHARING"` restricts to SHARING wallets
        including archived (A-45) — PERSONAL spending never reaches household
        budget/advisor aggregates.
      */
      const result = await db.transaction.aggregate({
        where: {
          householdId,
          ...ACTIVE,
          ...scopeFilter(scope),
          type: range.type,
          transferGroupId: null,
          occurredAt: { gte: range.from, lte: range.to },
        },
        _sum: { amountMinor: true },
      });
      return result._sum.amountMinor ?? 0;
    },
    async listByDay(householdId, range, scope) {
      /* Excludes transfer legs so the spending chart never plots a transfer (A-45). */
      const rows = await db.transaction.groupBy({
        by: ["occurredAt"],
        where: {
          householdId,
          ...ACTIVE,
          ...scopeFilter(scope),
          type: "MONEY_OUT",
          transferGroupId: null,
          occurredAt: { gte: range.from, lte: range.to },
        },
        _sum: { amountMinor: true },
      });
      return rows.map((row) => ({ date: row.occurredAt, amountMinor: row._sum.amountMinor ?? 0 }));
    },
  };
}

const WALLET_INCLUDE = {
  createdBy: { select: { displayName: true } },
  /* Joined WITHOUT archived/is_active filters: an old label stays resolvable. */
  officialInstitution: { select: { id: true, displayName: true } },
  customInstitution: { select: { id: true, displayName: true, userId: true } },
} as const;

type WalletRow = {
  createdBy: { displayName: string } | null;
  officialInstitution: { id: string; displayName: string } | null;
  customInstitution: { id: string; displayName: string; userId: string } | null;
};

function toWalletRecord<T extends WalletRow>(row: T): WalletRecord {
  const { createdBy, officialInstitution, customInstitution, ...rest } = row;
  const institution: WalletInstitutionRecord | null = officialInstitution
    ? { kind: "OFFICIAL", id: officialInstitution.id, name: officialInstitution.displayName, ownerUserId: null }
    : customInstitution
      ? {
          kind: "CUSTOM",
          id: customInstitution.id,
          name: customInstitution.displayName,
          ownerUserId: customInstitution.userId,
        }
      : null;
  return {
    ...(rest as unknown as WalletRecord),
    createdByDisplayName: createdBy?.displayName ?? null,
    institution,
  };
}

export function createWalletRepository(db: Db): WalletRepository {
  const visible = (actor: WalletActor) => visibleWalletWhere(actor);
  const findVisible = async (actor: WalletActor, id: string): Promise<WalletRecord | null> => {
    const row = await db.wallet.findFirst({
      where: { id, ...visible(actor) },
      include: WALLET_INCLUDE,
    });
    return row ? toWalletRecord(row) : null;
  };

  return {
    async create(data) {
      const row = await db.wallet.create({ data: data as never, include: WALLET_INCLUDE });
      return toWalletRecord(row);
    },
    async list(actor, view) {
      const rows = await db.wallet.findMany({
        where: {
          ...visible(actor),
          ...(view === "active"
            ? { archivedAt: null }
            : view === "archived"
              ? { archivedAt: { not: null } }
              : {}),
        },
        orderBy: [{ scope: "asc" }, { name: "asc" }, { id: "asc" }],
        include: WALLET_INCLUDE,
      });
      return rows.map(toWalletRecord);
    },
    findById: (actor, id) => findVisible(actor, id),
    async findByIdAnyWallet(householdId, id) {
      const row = await db.wallet.findFirst({
        where: { id, householdId },
        include: WALLET_INCLUDE,
      });
      return row ? toWalletRecord(row) : null;
    },
    async update(actor, id, patch) {
      /* Visibility lives in the WHERE (A-38); 0 rows → not found/not visible. */
      const result = await db.wallet.updateMany({ where: { id, ...visible(actor) }, data: patch as never });
      if (result.count === 0) throw notFound("Dompet tidak ditemukan.");
      return toWalletRecord(
        await db.wallet.findUniqueOrThrow({ where: { id }, include: WALLET_INCLUDE }),
      );
    },
    async setArchived(actor, id, archived, byUserId) {
      const result = await db.wallet.updateMany({
        where: { id, ...visible(actor) },
        data: archived
          ? { archivedAt: new Date(), archivedByUserId: byUserId }
          : { archivedAt: null, archivedByUserId: null },
      });
      if (result.count === 0) throw notFound("Dompet tidak ditemukan.");
      return toWalletRecord(
        await db.wallet.findUniqueOrThrow({ where: { id }, include: WALLET_INCLUDE }),
      );
    },
    async lockWallet(id) {
      /* SELECT ... FOR UPDATE serializes the opening-balance check with leg inserts (A-42). */
      const rows = await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "wallet" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (rows.length === 0) return null;
      const row = await db.wallet.findUnique({ where: { id }, include: WALLET_INCLUDE });
      return row ? toWalletRecord(row) : null;
    },
    async hasTransactions(walletId) {
      /* No deleted_at filter: trashed rows and a single transfer leg both lock (A-42). */
      const count = await db.transaction.count({ where: { walletId } });
      return count > 0;
    },
    async balances(householdId) {
      const wallets = await db.wallet.findMany({
        where: { householdId },
        select: { id: true, openingBalanceMinor: true },
      });
      const grouped = await db.transaction.groupBy({
        by: ["walletId", "type"],
        where: { householdId, deletedAt: null },
        _sum: { amountMinor: true },
      });
      /* Count includes trashed rows and transfer legs: any row locks opening (A-42). */
      const counts = await db.transaction.groupBy({
        by: ["walletId"],
        where: { householdId },
        _count: { _all: true },
      });
      const map = new Map<string, { balanceMinor: number; transactionCount: number }>();
      for (const wallet of wallets) {
        map.set(wallet.id, { balanceMinor: wallet.openingBalanceMinor, transactionCount: 0 });
      }
      for (const row of grouped) {
        const entry = map.get(row.walletId);
        if (!entry) continue;
        entry.balanceMinor +=
          row.type === "MONEY_IN" ? row._sum.amountMinor ?? 0 : -(row._sum.amountMinor ?? 0);
      }
      for (const row of counts) {
        const entry = map.get(row.walletId);
        if (entry) entry.transactionCount = row._count._all;
      }
      return [...map.entries()].map(([walletId, value]) => ({ walletId, ...value }));
    },
    async ensureMigratedDefault(householdId, ownerUserId) {
      const existing = await db.wallet.findFirst({
        where: { householdId, systemKey: "legacy_default" },
        include: WALLET_INCLUDE,
      });
      if (existing) return toWalletRecord(existing);
      try {
        const row = await db.wallet.create({
          data: {
            householdId,
            createdByUserId: ownerUserId,
            scope: "SHARING",
            name: "Dompet Keluarga",
            openingBalanceMinor: 0,
            systemKey: "legacy_default",
          },
          include: WALLET_INCLUDE,
        });
        return toWalletRecord(row);
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const row = await db.wallet.findUniqueOrThrow({
          where: { householdId_systemKey: { householdId, systemKey: "legacy_default" } },
          include: WALLET_INCLUDE,
        });
        return toWalletRecord(row);
      }
    },
  };
}

export function createGoalRepository(db: Db): GoalRepository {
  return {
    async create(data) {
      const row = await db.savingsGoal.create({ data });
      /* Full row needed by the GoalDTO (T-007). */
      return row;
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
    async findById(householdId, id) {
      /* Extended-unique where: cross-household id resolves to null (ADR-006). */
      return db.receipt.findFirst({ where: { id, householdId } });
    },
    async create(data) {
      const row = await db.receipt.create({ data });
      return { id: row.id };
    },
    async lockByIdForActor(actor, id) {
      /*
        Row lock (T-012): serialize retry claims for the same receipt. The
        WHERE clause keeps the ACL in the lock statement so a foreign or
        non-uploader id never locks (and never leaks existence).
      */
      const rows = await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "receipt"
        WHERE "id" = ${id}::uuid
          AND "household_id" = ${actor.householdId}::uuid
          AND "uploaded_by_user_id" = ${actor.userId}::uuid
        FOR UPDATE
      `;
      if (rows.length === 0) return null;
      return db.receipt.findFirst({
        where: { id, householdId: actor.householdId, uploadedByUserId: actor.userId },
      });
    },
    async findImageByIdForActor(actor, id) {
      const receipt = await db.receipt.findFirst({ where: { id, householdId: actor.householdId } });
      if (!receipt) return null;
      if (receipt.uploadedByUserId === actor.userId) return receipt;
      /* union over ALL linked transactions (no deleted_at filter), wallet-visible. */
      const link = await db.transaction.findFirst({
        where: {
          receiptId: receipt.id,
          householdId: actor.householdId,
          wallet: { is: visibleWalletWhere(actor) },
        },
        select: { id: true },
      });
      return link ? receipt : null;
    },
    async isSharedWithHousehold(receiptId) {
      const link = await db.transaction.findFirst({
        where: { receiptId, wallet: { is: { scope: "SHARING" } } },
        select: { id: true },
      });
      return link !== null;
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
      return (row as unknown as OcrJobRecord | null) ?? null;
    },
    async findByIdForActor(actor, id) {
      /* C-29: uploader-only, before and after any transaction save. */
      const row = await db.ocrJob.findFirst({
        where: {
          id,
          receipt: { householdId: actor.householdId, uploadedByUserId: actor.userId },
        },
      });
      return (row as unknown as OcrJobRecord | null) ?? null;
    },
    async findByReceiptId(householdId, receiptId) {
      const row = await db.ocrJob.findFirst({
        where: { receiptId, receipt: { householdId } },
        orderBy: [{ attempt: "desc" }, { id: "desc" }],
      });
      return (row as unknown as OcrJobRecord | null) ?? null;
    },
    async update(id, patch) {
      const row = await db.ocrJob.update({ where: { id }, data: patch as never });
      return row as unknown as OcrJobRecord;
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

export function createPersonalBudgetRepository(db: Db): PersonalBudgetRepository {
  return {
    async findByPeriod(householdId, userId, periodStart) {
      return db.personalBudget.findUnique({
        where: { householdId_userId_periodStart: { householdId, userId, periodStart } },
      });
    },
    async upsert(householdId, userId, periodStart, amountMinor, createdByUserId) {
      const row = await db.personalBudget.upsert({
        where: { householdId_userId_periodStart: { householdId, userId, periodStart } },
        create: { householdId, userId, periodStart, amountMinor, createdByUserId },
        update: { amountMinor },
      });
      return { id: row.id, amountMinor: row.amountMinor };
    },
  };
}

const CLAIM_SAVEPOINT = "idempotency_claim";

/** Prisma unique-constraint violation (P2002), thrown by the claim insert. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function createIdempotencyRepository(db: Db): IdempotencyRepository {
  return {
    async claim(userId, key, requestHash, ttlHours) {
      /*
        Insert-as-claim (A-11 / D-2): the UNIQUE(user_id, key) constraint is the
        claim. On conflict, re-read and compare the request hash.

        The insert runs inside a SAVEPOINT because a P2002 aborts the enclosing
        PostgreSQL transaction (25P02 on the next query). Rolling back to the
        savepoint restores the transaction so the follow-up read can run; this is
        what makes replay/409 work instead of a 500.
      */
      const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
      await db.$executeRawUnsafe(`SAVEPOINT ${CLAIM_SAVEPOINT}`);
      try {
        await db.idempotencyKey.create({ data: { userId, key, requestHash, expiresAt } });
        await db.$executeRawUnsafe(`RELEASE SAVEPOINT ${CLAIM_SAVEPOINT}`);
        return { claimed: true };
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        await db.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${CLAIM_SAVEPOINT}`);
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

/* ── Bundle for the ledger services (T-006) ────────────────────────── */

/** The repositories a ledger mutation needs, wired to one client/transaction. */
export interface LedgerRepositories {
  transaction: TransactionRepository;
  wallet: WalletRepository;
  institution: InstitutionRepository;
  receipt: ReceiptRepository;
  ocrJob: OcrJobRepository;
  idempotency: IdempotencyRepository;
}

export function createLedgerRepositories(db: Db): LedgerRepositories {
  return {
    transaction: createTransactionRepository(db),
    wallet: createWalletRepository(db),
    institution: createInstitutionRepository(db),
    receipt: createReceiptRepository(db),
    ocrJob: createOcrJobRepository(db),
    idempotency: createIdempotencyRepository(db),
  };
}

/* ── Bundle for the dashboard/budget reads (T-005) ─────────────────── */

/** Read-only repositories the dashboard and budget services need. */
export interface DashboardRepositories {
  transaction: TransactionRepository;
  wallet: WalletRepository;
  goal: GoalRepository;
  budget: BudgetRepository;
  personalBudget: PersonalBudgetRepository;
}

export function createDashboardRepositories(db: Db): DashboardRepositories {
  return {
    transaction: createTransactionRepository(db),
    wallet: createWalletRepository(db),
    goal: createGoalRepository(db),
    budget: createBudgetRepository(db),
    personalBudget: createPersonalBudgetRepository(db),
  };
}

/* ── Bundle for goals + advisor services (T-007) ───────────────────── */

/** Repositories the goals/advisor services read and write. */
export interface PlanningRepositories {
  transaction: TransactionRepository;
  goal: GoalRepository;
  budget: BudgetRepository;
  advisorInsight: AdvisorInsightRepository;
  idempotency: IdempotencyRepository;
}

export function createPlanningRepositories(db: Db): PlanningRepositories {
  return {
    transaction: createTransactionRepository(db),
    goal: createGoalRepository(db),
    budget: createBudgetRepository(db),
    advisorInsight: createAdvisorInsightRepository(db),
    idempotency: createIdempotencyRepository(db),
  };
}