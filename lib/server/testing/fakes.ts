/*
  TEST-ONLY in-memory fakes for the ledger seam (mock-seams dev plan).
  Never imported by application code or route handlers. Tests construct the real
  services with these fakes so business rules, idempotency ordering, and route
  contracts are exercised without a database.
*/

import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { BlobStore } from "../providers/blob";
import type { AdvisorAggregate, AdvisorGeneration, AdvisorProvider } from "../providers/advisor";
import type { OcrExtraction, OcrProvider } from "../providers/ocr";
import type {
  AdvisorInsightRecord,
  BudgetRepository,
  GoalRecord,
  GoalRepository,
  AdvisorInsightRepository,
  IdempotencyRepository,
  LedgerRepositories,
  OcrJobRecord,
  PlanningRepositories,
  ReceiptRepository,
  TransactionRecord,
  TransactionRepository,
  WalletActor,
  WalletRecord,
  WalletRepository,
} from "../repositories/ledger";
import type {
  BankInstitutionRecord,
  InstitutionRepository,
  UserCustomInstitutionRecord,
} from "../repositories/institutions";
import type { LedgerTransaction, PlanningTransaction } from "../services/types";

export type FakeIdempotencyRow = {
  requestHash: string;
  responseStatus: number | null;
  responseBody: unknown;
};

export type FakeGoalBudgetRow = {
  id: string;
  householdId: string;
  periodStart: Date;
  amountMinor: number;
  createdByUserId: string;
};

export type FakeStore = {
  transactions: TransactionRecord[];
  wallets: WalletRecord[];
  officialInstitutions: BankInstitutionRecord[];
  customInstitutions: UserCustomInstitutionRecord[];
  goals: GoalRecord[];
  insights: AdvisorInsightRecord[];
  budgets: FakeGoalBudgetRow[];
  receipts: Array<{
    id: string;
    householdId: string;
    uploadedByUserId: string;
    contentSha256: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
  }>;
  jobs: OcrJobRecord[];
  idempotency: Map<string, FakeIdempotencyRow>;
  order: string[];
};

export function createFakeStore(): FakeStore {
  return {
    transactions: [],
    wallets: [],
    officialInstitutions: [],
    customInstitutions: [],
    goals: [],
    insights: [],
    budgets: [],
    receipts: [],
    jobs: [],
    idempotency: new Map(),
    order: [],
  };
}

type CreateTransactionData = Parameters<TransactionRepository["create"]>[0];

function walletVisible(store: FakeStore, actor: WalletActor, walletId: string): boolean {
  const wallet = store.wallets.find((item) => item.id === walletId && item.householdId === actor.householdId);
  if (!wallet) return false;
  return wallet.scope === "SHARING" || wallet.createdByUserId === actor.userId;
}

function transactionApis(store: FakeStore): TransactionRepository {
  const create = async (data: CreateTransactionData): Promise<TransactionRecord> => {
    store.order.push("transaction.create");
    const row: TransactionRecord = {
      id: randomUUID(),
      currencyCode: "IDR",
      deletedAt: null,
      deletedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      category: data.category ?? null,
      merchant: data.merchant ?? null,
      note: data.note ?? null,
      receiptId: data.receiptId ?? null,
      transferGroupId: data.transferGroupId ?? null,
    };
    store.transactions.push(row);
    return row;
  };

  return {
    create,
    async updateActive(actor, id, data) {
      const row = store.transactions.find(
        (item) =>
          item.id === id &&
          item.householdId === actor.householdId &&
          item.deletedAt === null &&
          walletVisible(store, actor, item.walletId),
      );
      if (!row) return null;
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    async createTransferPair(householdId, createdByUserId, outLeg, inLeg) {
      const transferGroupId = randomUUID();
      const out = await create({ ...outLeg, householdId, createdByUserId, type: "MONEY_OUT", source: "MANUAL", transferGroupId });
      const inn = await create({ ...inLeg, householdId, createdByUserId, type: "MONEY_IN", source: "MANUAL", transferGroupId });
      return [out, inn];
    },
    async findById(actor, id) {
      const row = store.transactions.find((item) => item.id === id && item.householdId === actor.householdId);
      return row && walletVisible(store, actor, row.walletId) ? row : null;
    },
    async findByIdAnyWallet(householdId, id) {
      return store.transactions.find((row) => row.id === id && row.householdId === householdId) ?? null;
    },
    async listActive(actor, filters = {}) {
      const rows = store.transactions
        .filter((row) => row.householdId === actor.householdId && row.deletedAt === null)
        .filter((row) => walletVisible(store, actor, row.walletId))
        .filter((row) => (filters.type ? row.type === filters.type : true))
        .filter((row) => (filters.source ? row.source === filters.source : true))
        .filter((row) => (filters.walletId ? row.walletId === filters.walletId : true))
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
      return { rows, nextCursor: null };
    },
    async findGroupLegs(householdId, transferGroupId) {
      return store.transactions.filter((row) => row.householdId === householdId && row.transferGroupId === transferGroupId);
    },
    async privateGroupIdsForActor(actor, groupIds) {
      const redacted = new Set<string>();
      for (const groupId of groupIds) {
        const legs = store.transactions.filter((row) => row.householdId === actor.householdId && row.transferGroupId === groupId);
        if (legs.some((leg) => !walletVisible(store, actor, leg.walletId))) redacted.add(groupId);
      }
      return redacted;
    },
    async softDelete(actor, id, userId) {
      const row = store.transactions.find((item) => item.id === id && item.householdId === actor.householdId && item.deletedAt === null && walletVisible(store, actor, item.walletId));
      if (!row) return { alreadyDeleted: true };
      row.deletedAt = new Date();
      row.deletedByUserId = userId;
      return { alreadyDeleted: false };
    },
    async restore(actor, id) {
      const row = store.transactions.find((item) => item.id === id && item.householdId === actor.householdId && item.deletedAt !== null && walletVisible(store, actor, item.walletId));
      if (!row) return { alreadyActive: true };
      row.deletedAt = null;
      row.deletedByUserId = null;
      return { alreadyActive: false };
    },
    async softDeleteGroup(householdId, transferGroupId, userId) {
      const legs = store.transactions.filter((row) => row.householdId === householdId && row.transferGroupId === transferGroupId && row.deletedAt === null);
      for (const leg of legs) {
        leg.deletedAt = new Date();
        leg.deletedByUserId = userId;
      }
      return legs.length;
    },
    async restoreGroup(householdId, transferGroupId) {
      const legs = store.transactions.filter((row) => row.householdId === householdId && row.transferGroupId === transferGroupId && row.deletedAt !== null);
      for (const leg of legs) {
        leg.deletedAt = null;
        leg.deletedByUserId = null;
      }
      return legs.length;
    },
    async listTrash(actor) {
      const rows = store.transactions
        .filter((row) => row.householdId === actor.householdId && row.deletedAt !== null)
        .filter((row) => walletVisible(store, actor, row.walletId))
        .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));
      return { rows, nextCursor: null };
    },
    async sumByType(householdId, range, scope) {
      /* Realistic aggregate: sum actual rows in the Jakarta day range. */
      let total = 0;
      for (const row of store.transactions) {
        if (
          row.householdId === householdId &&
          row.deletedAt === null &&
          row.type === range.type &&
          row.transferGroupId === null &&
          row.occurredAt.getTime() >= range.from.getTime() &&
          row.occurredAt.getTime() <= range.to.getTime()
        ) {
          if (scope?.walletScope) {
            const wallet = store.wallets.find((item) => item.id === row.walletId);
            if (!wallet || wallet.scope !== scope.walletScope) continue;
          }
          total += row.amountMinor;
        }
      }
      return total;
    },
    async listByDay() {
      return [];
    },
  };
}

function receiptApis(store: FakeStore): ReceiptRepository {
  return {
    async findByHash(householdId, contentSha256) {
      store.order.push("receipt.findByHash");
      const row = store.receipts.find(
        (item) => item.householdId === householdId && item.contentSha256 === contentSha256,
      );
      return row ? { ...row } : null;
    },
    async findById(householdId, id) {
      const row = store.receipts.find((item) => item.id === id && item.householdId === householdId);
      return row ? { ...row } : null;
    },
    async create(data) {
      const row = { id: randomUUID(), ...data };
      store.receipts.push(row);
      return { id: row.id };
    },
    async lockByIdForActor(actor, id) {
      /*
        In-memory tests cannot hold a real row lock. The fake ledger's
        transaction runner is serialized by the test when it needs to model
        two retries racing for the same receipt.
      */
      const row = store.receipts.find(
        (item) =>
          item.id === id &&
          item.householdId === actor.householdId &&
          item.uploadedByUserId === actor.userId,
      );
      return row ? { ...row } : null;
    },
    async findImageByIdForActor(actor, id) {
      const receipt = store.receipts.find((item) => item.id === id && item.householdId === actor.householdId);
      if (!receipt) return null;
      if (receipt.uploadedByUserId === actor.userId) return { ...receipt };
      const linked = store.transactions.some(
        (row) => row.receiptId === receipt.id && row.householdId === actor.householdId && walletVisible(store, actor, row.walletId),
      );
      return linked ? { ...receipt } : null;
    },
    async isSharedWithHousehold(receiptId) {
      return store.transactions.some((row) => {
        if (row.receiptId !== receiptId) return false;
        const wallet = store.wallets.find((item) => item.id === row.walletId);
        return wallet?.scope === "SHARING";
      });
    },
  };
}

function findJob(store: FakeStore, id: string, householdId: string): OcrJobRecord | null {
  const job = store.jobs.find((item) => item.id === id);
  if (!job) return null;
  const receipt = store.receipts.find((item) => item.id === job.receiptId);
  return receipt && receipt.householdId === householdId ? job : null;
}

function ocrJobApis(store: FakeStore): LedgerRepositories["ocrJob"] {
  return {
    async create(data) {
      const row: OcrJobRecord = {
        id: randomUUID(),
        receiptId: data.receiptId,
        status: data.status,
        attempt: data.attempt ?? 1,
        model: data.model ?? null,
        resultJson: data.resultJson ?? null,
        confidence: data.confidence ?? null,
        errorCode: data.errorCode ?? null,
        createdAt: new Date(),
        completedAt: data.completedAt ?? null,
      };
      store.jobs.push(row);
      return { id: row.id, status: row.status };
    },
    async findById(householdId, id) {
      return findJob(store, id, householdId);
    },
    async findByIdForActor(actor, id) {
      const job = store.jobs.find((item) => item.id === id);
      if (!job) return null;
      const receipt = store.receipts.find((item) => item.id === job.receiptId);
      if (!receipt || receipt.householdId !== actor.householdId || receipt.uploadedByUserId !== actor.userId) {
        return null;
      }
      return job;
    },
    async findByReceiptId(householdId, receiptId) {
      const job =
        [...store.jobs]
          .filter((item) => item.receiptId === receiptId)
          .sort((a, b) => b.attempt - a.attempt)[0] ?? null;
      if (!job) return null;
      const receipt = store.receipts.find((item) => item.id === receiptId);
      return receipt && receipt.householdId === householdId ? job : null;
    },
    async update(id, patch) {
      const job = store.jobs.find((item) => item.id === id);
      if (!job) throw new Error("job not found");
      Object.assign(job, patch);
      if (patch.completedAt === undefined) job.completedAt = new Date();
      return job;
    },
  };
}

function idempotencyApis(store: FakeStore): IdempotencyRepository {
  return {
    async claim(userId, key, requestHash) {
      store.order.push("idempotency.claim");
      const id = `${userId}:${key}`;
      const existing = store.idempotency.get(id);
      if (existing) {
        return { claimed: false, existing: { ...existing } };
      }
      store.idempotency.set(id, { requestHash, responseStatus: null, responseBody: null });
      return { claimed: true };
    },
    async complete(userId, key, responseStatus, responseBody) {
      const id = `${userId}:${key}`;
      const existing = store.idempotency.get(id);
      if (existing) {
        existing.responseStatus = responseStatus;
        existing.responseBody = responseBody;
      }
    },
    async purgeExpired() {},
  };
}

function fakeWalletInstitution(
  store: FakeStore,
  officialInstitutionId: string | null,
  customInstitutionId: string | null,
): WalletRecord["institution"] {
  if (officialInstitutionId) {
    const row = store.officialInstitutions.find((item) => item.id === officialInstitutionId);
    if (row) {
      return { kind: "OFFICIAL", id: row.id, name: row.displayName, ownerUserId: null };
    }
  }
  if (customInstitutionId) {
    const row = store.customInstitutions.find((item) => item.id === customInstitutionId);
    if (row) {
      return { kind: "CUSTOM", id: row.id, name: row.displayName, ownerUserId: row.userId };
    }
  }
  return null;
}

function uniqueViolation(): Error {
  return Object.assign(new Error("unique constraint"), { code: "P2002" });
}

function institutionApis(store: FakeStore): InstitutionRepository {
  return {
    async listOfficialActive(query) {
      return store.officialInstitutions
        .filter((row) => row.isActive)
        .filter((row) => (query ? row.normalizedName.includes(query) : true))
        .sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));
    },
    async findOfficialById(id) {
      return store.officialInstitutions.find((row) => row.id === id) ?? null;
    },
    async findOfficialByNormalized(normalized) {
      return store.officialInstitutions.find(
        (row) => row.normalizedName === normalized && row.isActive,
      ) ?? null;
    },
    async listCustomByUser(userId, view) {
      return store.customInstitutions
        .filter((row) => row.userId === userId)
        .filter((row) => (view === "active" ? row.archivedAt === null : row.archivedAt !== null))
        .sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));
    },
    async findCustomByIdForUser(userId, id) {
      return store.customInstitutions.find((row) => row.id === id && row.userId === userId) ?? null;
    },
    async findCustomByNormalized(userId, normalized, view) {
      const rows = store.customInstitutions
        .filter(
          (row) =>
            row.userId === userId &&
            row.normalizedName === normalized &&
            (view === "active" ? row.archivedAt === null : row.archivedAt !== null),
        )
        .sort((a, b) => (b.archivedAt?.getTime() ?? 0) - (a.archivedAt?.getTime() ?? 0));
      return rows[0] ?? null;
    },
    async createCustom(userId, data) {
      if (
        store.customInstitutions.some(
          (row) =>
            row.userId === userId &&
            row.normalizedName === data.normalizedName &&
            row.archivedAt === null,
        )
      ) {
        throw uniqueViolation();
      }
      const row: UserCustomInstitutionRecord = {
        id: randomUUID(),
        userId,
        displayName: data.displayName,
        normalizedName: data.normalizedName,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.customInstitutions.push(row);
      return row;
    },
    async reactivateCustom(userId, id) {
      const row = store.customInstitutions.find((item) => item.id === id && item.userId === userId);
      if (!row) throw new Error("custom institution not found");
      if (
        store.customInstitutions.some(
          (item) =>
            item.id !== id &&
            item.userId === userId &&
            item.normalizedName === row.normalizedName &&
            item.archivedAt === null,
        )
      ) {
        throw uniqueViolation();
      }
      row.archivedAt = null;
      row.updatedAt = new Date();
      return row;
    },
    async setCustomArchived(userId, id, archived) {
      const row = store.customInstitutions.find((item) => item.id === id && item.userId === userId);
      if (!row) throw new Error("custom institution not found");
      if (
        !archived &&
        store.customInstitutions.some(
          (item) =>
            item.id !== id &&
            item.userId === userId &&
            item.normalizedName === row.normalizedName &&
            item.archivedAt === null,
        )
      ) {
        throw uniqueViolation();
      }
      row.archivedAt = archived ? new Date() : null;
      row.updatedAt = new Date();
      return row;
    },
  };
}

function walletApis(store: FakeStore): WalletRepository {
  const visible = (actor: WalletActor, wallet: WalletRecord) =>
    wallet.householdId === actor.householdId &&
    (wallet.scope === "SHARING" || wallet.createdByUserId === actor.userId);
  const findVisible = (actor: WalletActor, id: string) =>
    store.wallets.find((wallet) => wallet.id === id && visible(actor, wallet)) ?? null;

  return {
    async create(data) {
      const row: WalletRecord = {
        id: randomUUID(),
        createdByDisplayName: null,
        archivedAt: null,
        archivedByUserId: null,
        systemKey: data.systemKey ?? null,
        purpose: data.purpose ?? null,
        officialInstitutionId: data.officialInstitutionId ?? null,
        customInstitutionId: data.customInstitutionId ?? null,
        institution: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      row.institution = fakeWalletInstitution(
        store,
        row.officialInstitutionId,
        row.customInstitutionId,
      );
      store.wallets.push(row);
      return row;
    },
    async list(actor, view) {
      return store.wallets
        .filter((wallet) => visible(actor, wallet))
        .filter((wallet) =>
          view === "active" ? wallet.archivedAt === null : view === "archived" ? wallet.archivedAt !== null : true,
        )
        .sort((a, b) => (a.scope === b.scope ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.scope < b.scope ? -1 : 1));
    },
    async findById(actor, id) {
      return findVisible(actor, id);
    },
    async findByIdAnyWallet(householdId, id) {
      return store.wallets.find((wallet) => wallet.id === id && wallet.householdId === householdId) ?? null;
    },
    async update(actor, id, patch) {
      const row = findVisible(actor, id);
      if (!row) throw new Error("wallet not visible");
      Object.assign(row, patch, { updatedAt: new Date() });
      row.institution = fakeWalletInstitution(
        store,
        row.officialInstitutionId,
        row.customInstitutionId,
      );
      return row;
    },
    async setArchived(actor, id, archived, byUserId) {
      const row = findVisible(actor, id);
      if (!row) throw new Error("wallet not visible");
      row.archivedAt = archived ? new Date() : null;
      row.archivedByUserId = archived ? byUserId : null;
      return row;
    },
    async lockWallet(id) {
      return store.wallets.find((wallet) => wallet.id === id) ?? null;
    },
    async hasTransactions(walletId) {
      return store.transactions.some((row) => row.walletId === walletId);
    },
    async balances(householdId) {
      return store.wallets
        .filter((wallet) => wallet.householdId === householdId)
        .map((wallet) => {
          let balanceMinor = wallet.openingBalanceMinor;
          let transactionCount = 0;
          for (const row of store.transactions) {
            if (row.walletId !== wallet.id || row.householdId !== householdId) continue;
            transactionCount += 1;
            if (row.deletedAt === null) {
              balanceMinor += row.type === "MONEY_IN" ? row.amountMinor : -row.amountMinor;
            }
          }
          return { walletId: wallet.id, balanceMinor, transactionCount };
        });
    },
    async ensureMigratedDefault(householdId, ownerUserId) {
      const existing = store.wallets.find(
        (wallet) => wallet.householdId === householdId && wallet.systemKey === "legacy_default",
      );
      if (existing) return existing;
      const row: WalletRecord = {
        id: randomUUID(),
        householdId,
        createdByUserId: ownerUserId,
        createdByDisplayName: null,
        scope: "SHARING",
        name: "Dompet Keluarga",
        purpose: null,
        openingBalanceMinor: 0,
        officialInstitutionId: null,
        customInstitutionId: null,
        institution: null,
        archivedAt: null,
        archivedByUserId: null,
        systemKey: "legacy_default",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.wallets.push(row);
      return row;
    },
  };
}

export function createFakeLedger(store: FakeStore = createFakeStore()): {
  repos: LedgerRepositories;
  transaction: LedgerTransaction;
  store: FakeStore;
} {
  const repos: LedgerRepositories = {
    transaction: transactionApis(store),
    wallet: walletApis(store),
    institution: institutionApis(store),
    receipt: receiptApis(store),
    ocrJob: ocrJobApis(store),
    idempotency: idempotencyApis(store),
  };
  /* Pass-through runner: a real DB transaction commits/rolls back together. */
  const transaction: LedgerTransaction = (fn) => fn(repos);
  return { repos, transaction, store };
}

export function createFakeOcrProvider(result: OcrExtraction | Error) {
  const extract = vi.fn(async (): Promise<OcrExtraction> => {
    if (result instanceof Error) throw result;
    return result;
  });
  const provider: OcrProvider = { extract };
  return { provider, extract };
}

/* ── Goals + advisor seams (T-007) ─────────────────────────────────── */

function goalApis(store: FakeStore): GoalRepository {
  return {
    async create(data) {
      store.order.push("goal.create");
      const row: GoalRecord = {
        id: randomUUID(),
        currencyCode: "IDR",
        deletedAt: null,
        deletedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deadline: data.deadline ?? null,
        savedAmountMinor: 0,
        ...data,
      };
      store.goals.push(row);
      return row;
    },
    async listActive(householdId) {
      return store.goals
        .filter((row) => row.householdId === householdId && row.deletedAt === null)
        .sort((a, b) => {
          /* Prisma asc: null deadline last (Postgres NULLS LAST). */
          if (a.deadline === null && b.deadline === null) return a.id < b.id ? -1 : 1;
          if (a.deadline === null) return 1;
          if (b.deadline === null) return -1;
          return a.deadline.getTime() - b.deadline.getTime() || (a.id < b.id ? -1 : 1);
        });
    },
    async findById(householdId, id) {
      return store.goals.find((row) => row.id === id && row.householdId === householdId) ?? null;
    },
    async incrementSaved(householdId, id, delta) {
      /*
        Same conditional semantics as the Prisma implementation: rowcount 0 for
        a trashed/unknown goal or a negative result, atomically per call.
      */
      const row = store.goals.find((item) => item.id === id && item.householdId === householdId);
      if (!row || row.deletedAt !== null || row.savedAmountMinor + delta < 0) return 0;
      row.savedAmountMinor += delta;
      row.updatedAt = new Date();
      return 1;
    },
    async softDelete(householdId, id, userId) {
      const row = store.goals.find((item) => item.id === id && item.householdId === householdId && item.deletedAt === null);
      if (!row) return { alreadyDeleted: true };
      row.deletedAt = new Date();
      row.deletedByUserId = userId;
      return { alreadyDeleted: false };
    },
    async restore(householdId, id) {
      const row = store.goals.find((item) => item.id === id && item.householdId === householdId && item.deletedAt !== null);
      if (!row) return { alreadyActive: true };
      row.deletedAt = null;
      return { alreadyActive: false };
    },
    async listTrash(householdId, cursor) {
      const rows = [...store.goals.filter((row) => row.householdId === householdId && row.deletedAt !== null)];
      return { rows, nextCursor: cursor ? null : null };
    },
  };
}

function advisorInsightApis(store: FakeStore): AdvisorInsightRepository {
  return {
    async findLatestUnexpired(householdId, periodStart, periodEnd) {
      const now = new Date();
      for (const row of [...store.insights].sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())) {
        if (
          row.householdId === householdId &&
          row.sourcePeriodStart.getTime() === periodStart.getTime() &&
          row.sourcePeriodEnd.getTime() === periodEnd.getTime() &&
          row.expiresAt.getTime() > now.getTime()
        ) {
          return row;
        }
      }
      return null;
    },
    async create(data) {
      const row: AdvisorInsightRecord = {
        id: randomUUID(),
        limitations: null,
        ...data,
      };
      store.insights.push(row);
      return { id: row.id };
    },
    async prune(householdId, keep) {
      store.insights
        .filter((row) => row.householdId === householdId)
        .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
        .slice(keep)
        .forEach((row) => {
          const index = store.insights.indexOf(row);
          if (index >= 0) store.insights.splice(index, 1);
        });
    },
  };
}

function budgetApis(store: FakeStore): BudgetRepository {
  return {
    async findByPeriod(householdId, periodStart) {
      const row = store.budgets.find(
        (item) => item.householdId === householdId && item.periodStart.getTime() === periodStart.getTime(),
      );
      return row ?? null;
    },
    async upsert(householdId, periodStart, amountMinor, userId) {
      const existing = store.budgets.find((item) => item.householdId === householdId && item.periodStart.getTime() === periodStart.getTime());
      if (existing) {
        existing.amountMinor = amountMinor;
        return { id: existing.id, amountMinor };
      }
      const row = { id: randomUUID(), householdId, periodStart, amountMinor, createdByUserId: userId };
      store.budgets.push(row);
      return { id: row.id, amountMinor };
    },
  };
}

export function createFakePlanning(store: FakeStore = createFakeStore()): {
  repos: PlanningRepositories;
  transaction: PlanningTransaction;
  store: FakeStore;
} {
  const repos: PlanningRepositories = {
    transaction: transactionApis(store),
    goal: goalApis(store),
    budget: budgetApis(store),
    advisorInsight: advisorInsightApis(store),
    idempotency: idempotencyApis(store),
  };
  const transaction: PlanningTransaction = (fn) => fn(repos);
  return { repos, transaction, store };
}

export function createFakeAdvisorProvider(result: AdvisorGeneration | Error) {
  const insight = vi.fn(async (aggregate: AdvisorAggregate): Promise<AdvisorGeneration> => {
    void aggregate;
    if (result instanceof Error) throw result;
    return result;
  });
  const provider: AdvisorProvider = { insight };
  return { provider, insight };
}

export function createFakeBlobStore(fail = false) {
  const objects = new Map<string, Uint8Array>();
  const put = vi.fn(async (bytes: Uint8Array, key: string) => {
    if (fail) throw new Error("blob unavailable");
    objects.set(key, bytes);
    return { key, url: `https://blob.example/${key}` };
  });
  const get = vi.fn(async (key: string) => {
    const bytes = objects.get(key);
    if (!bytes) return null;
    return {
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    };
  });
  const store: BlobStore = { put, get };
  return { store, put, get, objects };
}
