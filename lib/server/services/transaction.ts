/*
  TransactionService (AC-F3-1..3, AC-F3-8, AC-F4-? transfer, T-009 F6).

  Business rules live here, not in the route handler: amount/date/category
  validation, wallet binding (MONEY_IN/OUT walletId, TRANSFER from/to wallets),
  the future-WIB check, transfer pairing (two legs, one shared
  transfer_group_id, one transaction), atomic pair trash/restore (A-40/A-41),
  and cross-scope generic redaction (A-39). POST mutations support the
  Idempotency-Key precedence via IdempotencyService; PATCH edits one active row.
*/

import { randomUUID } from "node:crypto";
import { hasAtMostTwoDecimals } from "@/lib/money-input";
import {
  CATEGORIES,
  MONEY_IN_CATEGORIES,
  type CreateTransactionRequest,
  type ListTransactionsQuery,
  type UpdateTransactionInput,
} from "../contracts/transactions";
import { forbidden, notFound, unprocessable, unprocessableCode, walletUnavailable } from "../errors";
import { dateOnlyToNoonJakarta, endOfJakartaDay, isFutureDateOnly, startOfJakartaDay } from "../jakarta";
import type {
  LedgerRepositories,
  TransactionRecord,
  TransactionRepository,
  WalletActor,
  WalletRecord,
  WalletRepository,
} from "../repositories/ledger";
import type { TransactionDTO, WalletRefDTO } from "@/types/api";
import { computeRequestHash, IdempotencyService } from "./idempotency";
import type { LedgerTransaction, ServiceResult } from "./types";

const INT32_MAX = 2_147_483_647;
const TRANSACTION_PATH = "/api/transactions";

export type TransactionActor = WalletActor;

type CreateInput = CreateTransactionRequest & { source: "MANUAL" | "OCR" };

export class TransactionService {
  constructor(
    private readonly repos: LedgerRepositories,
    private readonly transaction: LedgerTransaction,
    private readonly idempotency: IdempotencyService,
  ) {}

  createManual(actor: TransactionActor, input: CreateTransactionRequest, idempotencyKey?: string): Promise<ServiceResult> {
    return this.create(actor, { ...input, source: "MANUAL", receiptId: undefined }, idempotencyKey);
  }

  createFromOcr(actor: TransactionActor, input: CreateTransactionRequest, idempotencyKey?: string): Promise<ServiceResult> {
    return this.create(actor, { ...input, source: "OCR" }, idempotencyKey);
  }

  private async create(actor: TransactionActor, input: CreateInput, idempotencyKey?: string): Promise<ServiceResult> {
    this.validate(input);
    const run = (repos: LedgerRepositories) => this.persist(repos, actor, input);

    if (idempotencyKey) {
      const hash = computeRequestHash("POST", TRANSACTION_PATH, {
        type: input.type,
        amountMinor: input.amountMinor,
        category: input.category ?? null,
        occurredAt: input.occurredAt,
        merchant: input.merchant ?? null,
        note: input.note ?? null,
        source: input.source,
        receiptId: input.receiptId ?? null,
        walletId: input.walletId ?? null,
        fromWalletId: input.fromWalletId ?? null,
        toWalletId: input.toWalletId ?? null,
      });
      return this.idempotency.run(actor.userId, idempotencyKey, hash, run);
    }
    return this.transaction(run);
  }

  /** Service-level validation on top of the Zod boundary (AC-F3-1, A-40). */
  private validate(input: CreateInput): void {
    if (!hasAtMostTwoDecimals(input.amountMinor) || input.amountMinor <= 0) {
      throw unprocessable({ amountMinor: ["Jumlah harus lebih dari 0."] });
    }
    if (input.amountMinor > INT32_MAX) {
      throw unprocessableCode("AMOUNT_OUT_OF_RANGE", { amountMinor: ["Jumlah terlalu besar."] });
    }
    if (isFutureDateOnly(input.occurredAt)) {
      throw unprocessable({ occurredAt: ["Tanggal tidak boleh di masa depan."] });
    }
    if (input.type === "TRANSFER") {
      /*
        A-51: a bad wallet pair is a plain field validation (422
        `VALIDATION_ERROR` with `fieldErrors`), never a `TRANSFER_INVALID`
        code. The Zod contract already rejects the same cases at the HTTP
        boundary; these guards keep direct service calls (and the integration
        suite) on the identical code.
      */
      if (!input.fromWalletId) throw unprocessable({ fromWalletId: ["Pilih dompet asal."] });
      if (!input.toWalletId) throw unprocessable({ toWalletId: ["Pilih dompet tujuan."] });
      if (input.fromWalletId === input.toWalletId) {
        throw unprocessable({ toWalletId: ["Dompet asal dan tujuan harus berbeda."] });
      }
    } else {
      const allowed = input.type === "MONEY_IN" ? MONEY_IN_CATEGORIES : (CATEGORIES.filter((c) => c !== "income") as readonly string[]);
      if (input.category === undefined || !(allowed as readonly string[]).includes(input.category)) {
        throw unprocessable({ category: ["Pilih kategori yang sesuai."] });
      }
      if (!input.walletId) {
        throw unprocessable({ walletId: ["Pilih dompet."] });
      }
    }
    if (input.source === "OCR") {
      if (input.type === "TRANSFER") {
        throw unprocessable({ type: ["Transfer belum bisa lewat scan struk."] });
      }
      if (!input.receiptId) {
        throw unprocessable({ receiptId: ["Struk tidak ditemukan."] });
      }
    }
  }

  /**
   * Resolve + lock the wallet(s) before inserting legs so an opening-balance
   * correction serializes against the first transaction (A-42). Archived or
   * foreign wallets fail closed (A-43).
   */
  private async resolveActiveWallet(
    repos: LedgerRepositories,
    actor: TransactionActor,
    walletId: string,
  ): Promise<WalletRecord> {
    const wallet = await repos.wallet.findById(actor, walletId);
    if (!wallet) throw notFound("Dompet tidak ditemukan.");
    if (wallet.archivedAt) throw walletUnavailable();
    return wallet;
  }

  private async persist(
    repos: LedgerRepositories,
    actor: TransactionActor,
    input: CreateInput,
  ): Promise<ServiceResult> {
    const occurredAt = dateOnlyToNoonJakarta(input.occurredAt);
    const base = {
      householdId: actor.householdId,
      createdByUserId: actor.userId,
      amountMinor: input.amountMinor,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
      occurredAt,
      source: input.source,
    } as const;

    if (input.type === "TRANSFER") {
      /* Validate + lock both wallets in a stable order to avoid deadlocks. */
      const from = await this.resolveActiveWallet(repos, actor, input.fromWalletId!);
      const to = await this.resolveActiveWallet(repos, actor, input.toWalletId!);
      const lockOrder = [from.id, to.id].sort();
      for (const walletId of lockOrder) await repos.wallet.lockWallet(walletId);

      const transferGroupId = randomUUID();
      const out = await repos.transaction.create({
        ...base,
        type: "MONEY_OUT",
        category: null,
        source: "MANUAL",
        transferGroupId,
        walletId: from.id,
      });
      const inn = await repos.transaction.create({
        ...base,
        type: "MONEY_IN",
        category: null,
        source: "MANUAL",
        transferGroupId,
        walletId: to.id,
      });
      return {
        status: 201,
        body: {
          transactions: [
            toTransactionDTO(out, { id: from.id, name: from.name, scope: from.scope }),
            toTransactionDTO(inn, { id: to.id, name: to.name, scope: to.scope }),
          ] satisfies TransactionDTO[],
        },
      };
    }

    const wallet = await this.resolveActiveWallet(repos, actor, input.walletId!);
    await repos.wallet.lockWallet(wallet.id);

    if (input.source === "OCR" && input.receiptId) {
      const receipt = await repos.receipt.findById(actor.householdId, input.receiptId);
      if (!receipt) throw notFound("Struk tidak ditemukan.");
    }

    const row = await repos.transaction.create({
      ...base,
      type: input.type,
      category: input.category ?? null,
      receiptId: input.source === "OCR" ? input.receiptId ?? null : null,
      walletId: wallet.id,
    });
    return {
      status: 201,
      body: {
        transactions: [
          toTransactionDTO(row, { id: wallet.id, name: wallet.name, scope: wallet.scope }),
        ] satisfies TransactionDTO[],
      },
    };
  }

  async list(actor: TransactionActor, query: ListTransactionsQuery): Promise<ServiceResult> {
    const page = await this.repos.transaction.listActive(actor, {
      type: query.type,
      source: query.source,
      walletId: query.walletId,
      walletScope: query.scope,
      from: query.from ? startOfJakartaDay(query.from) : undefined,
      to: query.to ? endOfJakartaDay(query.to) : undefined,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
    return {
      status: 200,
      body: {
        rows: await this.decorate(actor, page.rows),
        nextCursor: page.nextCursor,
      },
    };
  }

  async update(actor: TransactionActor, id: string, input: UpdateTransactionInput): Promise<ServiceResult> {
    if (!hasAtMostTwoDecimals(input.amountMinor) || input.amountMinor <= 0) {
      throw unprocessable({ amountMinor: ["Jumlah harus lebih dari 0."] });
    }
    if (input.amountMinor > INT32_MAX) {
      throw unprocessableCode("AMOUNT_OUT_OF_RANGE", { amountMinor: ["Jumlah terlalu besar."] });
    }
    if (isFutureDateOnly(input.occurredAt)) {
      throw unprocessable({ occurredAt: ["Tanggal tidak boleh di masa depan."] });
    }
    const allowed = input.type === "MONEY_IN" ? MONEY_IN_CATEGORIES : CATEGORIES.filter((c) => c !== "income");
    if (!(allowed as readonly string[]).includes(input.category)) {
      throw unprocessable({ category: ["Pilih kategori yang sesuai."] });
    }

    return this.transaction(async (repos) => {
      const current = await repos.transaction.findById(actor, id);
      if (!current || current.deletedAt) throw notFound("Transaksi tidak ditemukan.");
      if (current.transferGroupId) {
        throw unprocessable({ type: ["Transfer belum bisa diedit."] });
      }

      const nextWallet =
        input.walletId === current.walletId
          ? await repos.wallet.findByIdAnyWallet(actor.householdId, current.walletId)
          : await this.resolveActiveWallet(repos, actor, input.walletId);
      if (!nextWallet) throw notFound("Dompet tidak ditemukan.");

      const walletIds = [...new Set([current.walletId, nextWallet.id])].sort();
      for (const walletId of walletIds) {
        const locked = await repos.wallet.lockWallet(walletId);
        if (!locked) throw notFound("Dompet tidak ditemukan.");
        if (walletId === nextWallet.id && walletId !== current.walletId && locked.archivedAt) {
          throw walletUnavailable();
        }
      }

      const updated = await repos.transaction.updateActive(actor, id, {
        type: input.type,
        amountMinor: input.amountMinor,
        category: input.category,
        merchant: input.merchant || null,
        note: input.note || null,
        occurredAt: dateOnlyToNoonJakarta(input.occurredAt),
        walletId: nextWallet.id,
      });
      if (!updated) throw notFound("Transaksi tidak ditemukan.");

      const [transaction] = await decorateTransactionRows(repos, actor, [updated]);
      return { status: 200, body: { transactions: transaction ? [transaction] : [] } };
    });
  }

  async listTrash(actor: TransactionActor, cursor?: string | null, limit?: number): Promise<ServiceResult> {
    const page = await this.repos.transaction.listTrash(actor, cursor ?? null, limit);
    return {
      status: 200,
      body: {
        rows: await this.decorate(actor, page.rows),
        nextCursor: page.nextCursor,
      },
    };
  }

  /** Builds redacted A-39 DTOs for a page of visible rows. */
  private decorate(actor: TransactionActor, rows: TransactionRecord[]): Promise<TransactionDTO[]> {
    return decorateTransactionRows(this.repos, actor, rows);
  }

  async softDelete(actor: TransactionActor, id: string, userId: string): Promise<ServiceResult> {
    const row = await this.repos.transaction.findById(actor, id);
    if (!row) throw notFound("Transaksi tidak ditemukan.");

    if (!row.transferGroupId) {
      const result = await this.repos.transaction.softDelete(actor, id, userId);
      const updated = await this.repos.transaction.findById(actor, id);
      return {
        status: 200,
        body: {
          id: row.id,
          deletedAt: updated?.deletedAt ? updated.deletedAt.toISOString() : null,
          alreadyDeleted: result.alreadyDeleted,
        },
      };
    }

    const legs = await this.repos.transaction.findGroupLegs(actor.householdId, row.transferGroupId);
    await this.authorizeTransferPair(legs, actor);
    const count = await this.repos.transaction.softDeleteGroup(actor.householdId, row.transferGroupId, userId);
    const updated = await this.repos.transaction.findByIdAnyWallet(actor.householdId, id);
    return {
      status: 200,
      body: {
        transferGroupId: row.transferGroupId,
        deletedAt: updated?.deletedAt ? updated.deletedAt.toISOString() : null,
        alreadyDeleted: count === 0,
      },
    };
  }

  async restore(actor: TransactionActor, id: string): Promise<ServiceResult> {
    const row = await this.repos.transaction.findById(actor, id);
    if (!row) throw notFound("Transaksi tidak ditemukan.");

    if (!row.transferGroupId) {
      const result = await this.repos.transaction.restore(actor, id);
      const updated = await this.repos.transaction.findById(actor, id);
      return {
        status: 200,
        body: {
          id: row.id,
          deletedAt: updated?.deletedAt ? updated.deletedAt.toISOString() : null,
          alreadyActive: result.alreadyActive,
        },
      };
    }

    const legs = await this.repos.transaction.findGroupLegs(actor.householdId, row.transferGroupId);
    await this.authorizeTransferPair(legs, actor);
    const count = await this.repos.transaction.restoreGroup(actor.householdId, row.transferGroupId);
    return {
      status: 200,
      body: {
        transferGroupId: row.transferGroupId,
        deletedAt: null,
        alreadyActive: count === 0,
      },
    };
  }

  /**
   * A-41 authorization matrix for a transfer pair. The actor already sees at
   * least one leg (visibility), so this only decides mutate permission.
   */
  private async authorizeTransferPair(legs: TransactionRecord[], actor: TransactionActor): Promise<void> {
    const wallets = await Promise.all(
      legs.map((leg) => this.repos.wallet.findByIdAnyWallet(actor.householdId, leg.walletId)),
    );
    const scopes = wallets.filter((w): w is WalletRecord => w !== null).map((w) => w.scope);

    /* SHARING↔SHARING: any APPROVED member who can access both wallets. */
    if (scopes.every((scope) => scope === "SHARING")) return;

    /* PERSONAL↔PERSONAL: only the owner of both wallets. */
    if (scopes.every((scope) => scope === "PERSONAL")) {
      const owners = new Set(wallets.map((w) => w?.createdByUserId));
      if (owners.size === 1 && owners.has(actor.userId)) return;
      throw forbidden("ACCESS_DENIED", "Kamu tidak punya akses untuk mengubah transfer ini.");
    }

    /* Cross-scope: transfer creator or household Owner only. */
    const isCreator = legs.some((leg) => leg.createdByUserId === actor.userId);
    if (isCreator || actor.role === "OWNER") return;
    throw forbidden("ACCESS_DENIED", "Kamu tidak punya akses untuk mengubah transfer ini.");
  }
}

/** Full DTO with the wallet reference for a row the actor may see (A-49). */
export function toTransactionDTO(row: TransactionRecord, wallet: WalletRefDTO | null): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    currencyCode: row.currencyCode,
    category: row.category,
    merchant: row.merchant,
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    source: row.source,
    receiptId: row.receiptId,
    transferGroupId: row.transferGroupId,
    wallet,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Generic cross-scope projection (A-39): keeps only the visible SHARING leg's
 * id/type/amount/currency/occurredAt and nulls every correlatable or private
 * field. Built server-side, never in UI styling.
 */
export function toGenericTransactionDTO(row: TransactionRecord): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    currencyCode: row.currencyCode,
    category: null,
    merchant: null,
    note: null,
    occurredAt: row.occurredAt.toISOString(),
    source: null,
    receiptId: null,
    transferGroupId: null,
    wallet: null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Shared DTO builder for any read path (activity list, dashboard recent
 * activity): applies A-39 redaction and attaches the wallet reference.
 */
export async function decorateTransactionRows(
  repos: { transaction: TransactionRepository; wallet: WalletRepository },
  actor: WalletActor,
  rows: TransactionRecord[],
): Promise<TransactionDTO[]> {
  const groupIds = rows
    .map((row) => row.transferGroupId)
    .filter((id): id is string => id !== null);
  const redactedGroups = await repos.transaction.privateGroupIdsForActor(actor, groupIds);
  const visibleWalletIds = [
    ...new Set(
      rows
        .filter((row) => !row.transferGroupId || !redactedGroups.has(row.transferGroupId))
        .map((row) => row.walletId),
    ),
  ];
  const wallets = visibleWalletIds.length
    ? await repos.wallet.findManyByIdsAnyWallet(actor.householdId, visibleWalletIds)
    : [];
  const walletRefs = new Map<string, WalletRefDTO>(wallets.map((wallet) => [wallet.id, wallet]));

  return rows.map((row) => {
    if (row.transferGroupId && redactedGroups.has(row.transferGroupId)) {
      return toGenericTransactionDTO(row);
    }
    return toTransactionDTO(row, walletRefs.get(row.walletId) ?? null);
  });
}
