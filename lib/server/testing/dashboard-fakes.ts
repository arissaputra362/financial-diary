/*
  TEST-ONLY in-memory dashboard seam (T-005; wallet-aware for T-009). Mirrors
  the repository semantics the dashboard relies on: active rows only, transfer
  legs excluded from aggregates, wallet-scope filtering, and a single seeded
  SHARING wallet so fixtures have a home. Never imported by application code.
*/

import { randomUUID } from "node:crypto";
import type {
  AggregateScope,
  BudgetCycleRepository,
  BudgetCycleSettingsRecord,
  BudgetRepository,
  GoalRepository,
  PersonalBudgetCycleRepository,
  PersonalBudgetRepository,
  TransactionRecord,
  TransactionRepository,
  WalletActor,
  WalletRecord,
  WalletRepository,
} from "../repositories/ledger";

export type FakeGoalRow = {
  id: string;
  householdId: string;
  name: string;
  targetAmountMinor: number;
  savedAmountMinor: number;
  deadline: Date | null;
  deletedAt: Date | null;
  /** Audit fields exist only for the widened GoalRecord mapping (T-007). */
  createdAt?: Date;
  updatedAt?: Date;
};
export type FakeBudgetRow = {
  id: string;
  householdId: string;
  periodStart: Date;
  amountMinor: number;
  createdByUserId: string;
  deletedAt?: Date | null;
};
export type FakePersonalBudgetRow = {
  id: string;
  householdId: string;
  userId: string;
  periodStart: Date;
  amountMinor: number;
  createdByUserId: string;
  deletedAt?: Date | null;
};

/** Default wallet every fixture transaction points at unless overridden. */
export const DEFAULT_WALLET_ID = "w-default";

export interface DashboardFakeStore {
  transactions: TransactionRecord[];
  wallets: WalletRecord[];
  goals: FakeGoalRow[];
  budgets: FakeBudgetRow[];
  personalBudgets: FakePersonalBudgetRow[];
  /** Keyed by householdId. Missing means the CALENDAR_MONTH default. */
  householdCycles: Map<string, BudgetCycleSettingsRecord>;
  /** Keyed by userId. Missing means the CALENDAR_MONTH default. */
  personalCycles: Map<string, BudgetCycleSettingsRecord>;
}

export function createDashboardFakeStore(): DashboardFakeStore {
  return {
    transactions: [],
    wallets: [],
    goals: [],
    budgets: [],
    personalBudgets: [],
    householdCycles: new Map(),
    personalCycles: new Map(),
  };
}

const notUsed = async (): Promise<never> => {
  throw new Error("repository method not used in this test");
};

export function createDashboardFake(store: DashboardFakeStore = createDashboardFakeStore()): {
  store: DashboardFakeStore;
  transaction: TransactionRepository;
  wallet: WalletRepository;
  goal: GoalRepository;
  budget: BudgetRepository;
  personalBudget: PersonalBudgetRepository;
  householdCycle: BudgetCycleRepository;
  personalCycle: PersonalBudgetCycleRepository;
} {
  const activeInHousehold = (householdId: string) =>
    store.transactions.filter((row) => row.householdId === householdId && row.deletedAt === null);

  /* Mirrors the repository wallet filter, including the T-015 owner narrowing. */
  const matchesScope = (row: TransactionRecord, scope?: AggregateScope): boolean => {
    if (!scope?.walletScope && !scope?.walletOwnerUserId) return true;
    const wallet = store.wallets.find((item) => item.id === row.walletId);
    if (!wallet) return false;
    if (scope.walletScope && wallet.scope !== scope.walletScope) return false;
    if (scope.walletOwnerUserId && wallet.createdByUserId !== scope.walletOwnerUserId) return false;
    return true;
  };

  const ensureWallet = (householdId: string): WalletRecord => {
    const existing = store.wallets.find((wallet) => wallet.id === DEFAULT_WALLET_ID && wallet.householdId === householdId);
    if (existing) return existing;
    const wallet: WalletRecord = {
      id: DEFAULT_WALLET_ID,
      householdId,
      createdByUserId: "owner-fake",
      createdByDisplayName: "Owner",
      scope: "SHARING",
      name: "Dompet Keluarga",
      purpose: null,
      openingBalanceMinor: 0,
      officialInstitutionId: null,
      customInstitutionId: null,
      institution: null,
      archivedAt: null,
      archivedByUserId: null,
      systemKey: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    store.wallets.push(wallet);
    return wallet;
  };

  const transaction: TransactionRepository = {
    create: notUsed,
    updateActive: notUsed,
    createTransferPair: notUsed,
    async findById(actor, id) {
      const row = store.transactions.find((item) => item.id === id && item.householdId === actor.householdId);
      return row ?? null;
    },
    async findByIdAnyWallet(householdId, id) {
      return store.transactions.find((row) => row.id === id && row.householdId === householdId) ?? null;
    },
    async listActive(actor, filters = {}) {
      let rows = activeInHousehold(actor.householdId);
      if (filters.type) rows = rows.filter((row) => row.type === filters.type);
      if (filters.source) rows = rows.filter((row) => row.source === filters.source);
      if (filters.walletId) rows = rows.filter((row) => row.walletId === filters.walletId);
      rows = rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
      const limit = filters.limit ?? 20;
      const page = rows.slice(0, limit);
      return { rows: page, nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null };
    },
    async findGroupLegs(householdId, transferGroupId) {
      return store.transactions.filter((row) => row.householdId === householdId && row.transferGroupId === transferGroupId);
    },
    async privateGroupIdsForActor() {
      /* Dashboard fixtures have no cross-scope transfers. */
      return new Set<string>();
    },
    async sumByType(householdId, range, scope) {
      ensureWallet(householdId);
      return activeInHousehold(householdId)
        .filter(
          (row) =>
            row.transferGroupId === null &&
            row.type === range.type &&
            row.occurredAt >= range.from &&
            row.occurredAt <= range.to,
        )
        .filter((row) => matchesScope(row, scope))
        .reduce((total, row) => total + row.amountMinor, 0);
    },
    async sumTransfersFromSharedToPersonal(householdId, range) {
      const personalGroups = new Set(
        store.transactions
          .filter((row) => row.householdId === householdId && row.deletedAt === null && row.type === "MONEY_IN" && row.transferGroupId)
          .filter((row) => store.wallets.find((wallet) => wallet.id === row.walletId)?.scope === "PERSONAL")
          .map((row) => row.transferGroupId),
      );
      return store.transactions
        .filter((row) => row.householdId === householdId && row.deletedAt === null && row.type === "MONEY_OUT" && row.transferGroupId !== null)
        .filter((row) => row.occurredAt >= range.from && row.occurredAt <= range.to && personalGroups.has(row.transferGroupId))
        .filter((row) => store.wallets.find((wallet) => wallet.id === row.walletId)?.scope === "SHARING")
        .reduce((sum, row) => sum + row.amountMinor, 0);
    },
    async listByDay(householdId, range, scope) {
      ensureWallet(householdId);
      const totals = new Map<number, number>();
      for (const row of activeInHousehold(householdId)) {
        if (row.type !== "MONEY_OUT" || row.transferGroupId !== null) continue;
        if (row.occurredAt < range.from || row.occurredAt > range.to) continue;
        if (!matchesScope(row, scope)) continue;
        const key = row.occurredAt.getTime();
        totals.set(key, (totals.get(key) ?? 0) + row.amountMinor);
      }
      return [...totals.entries()].map(([time, amountMinor]) => ({ date: new Date(time), amountMinor }));
    },
    softDelete: notUsed,
    restore: notUsed,
    softDeleteGroup: notUsed,
    restoreGroup: notUsed,
    listTrash: notUsed,
  };

  const visible = (actor: WalletActor, wallet: WalletRecord) =>
    wallet.householdId === actor.householdId &&
    (wallet.scope === "SHARING" || wallet.createdByUserId === actor.userId);

  const wallet: WalletRepository = {
    create: notUsed,
    async list(actor, view) {
      ensureWallet(actor.householdId);
      return store.wallets
        .filter((item) => visible(actor, item))
        .filter((item) =>
          view === "active" ? item.archivedAt === null : view === "archived" ? item.archivedAt !== null : true,
        );
    },
    async findById(actor, id) {
      ensureWallet(actor.householdId);
      return store.wallets.find((item) => item.id === id && visible(actor, item)) ?? null;
    },
    async findByIdAnyWallet(householdId, id) {
      ensureWallet(householdId);
      return store.wallets.find((item) => item.id === id && item.householdId === householdId) ?? null;
    },
    async findManyByIdsAnyWallet(householdId, ids) {
      ensureWallet(householdId);
      const uniqueIds = new Set(ids);
      return store.wallets.filter(
        (item) => item.householdId === householdId && uniqueIds.has(item.id),
      );
    },
    update: notUsed,
    setArchived: notUsed,
    async lockWallet(id) {
      return store.wallets.find((item) => item.id === id) ?? null;
    },
    async hasTransactions(walletId) {
      return store.transactions.some((row) => row.walletId === walletId);
    },
    async balances(householdId) {
      ensureWallet(householdId);
      return store.wallets
        .filter((item) => item.householdId === householdId)
        .map((item) => {
          let balanceMinor = item.openingBalanceMinor;
          let transactionCount = 0;
          for (const row of store.transactions) {
            if (row.walletId !== item.id || row.householdId !== householdId) continue;
            transactionCount += 1;
            if (row.deletedAt === null) balanceMinor += row.type === "MONEY_IN" ? row.amountMinor : -row.amountMinor;
          }
          return { walletId: item.id, balanceMinor, transactionCount };
        });
    },
    ensureMigratedDefault: notUsed,
  };

  const goal: GoalRepository = {
    create: notUsed,
    async listActive(householdId) {
      return store.goals
        .filter((row) => row.householdId === householdId && row.deletedAt === null)
        .map((row) => ({
          id: row.id,
          householdId: row.householdId,
          createdByUserId: "user-fake",
          name: row.name,
          targetAmountMinor: row.targetAmountMinor,
          savedAmountMinor: row.savedAmountMinor,
          currencyCode: "IDR",
          deadline: row.deadline,
          deletedAt: row.deletedAt,
          deletedByUserId: null,
          createdAt: row.createdAt ?? new Date(0),
          updatedAt: row.updatedAt ?? new Date(0),
        }));
    },
    findById: notUsed,
    incrementSaved: notUsed,
    softDelete: notUsed,
    restore: notUsed,
    listTrash: notUsed,
  };

  const budget: BudgetRepository = {
    async findByPeriod(householdId, periodStart) {
      const row = store.budgets.find(
        (item) => item.householdId === householdId && item.periodStart.getTime() === periodStart.getTime() && !item.deletedAt,
      );
      return row ? { id: row.id, amountMinor: row.amountMinor, periodStart: row.periodStart } : null;
    },
    async upsert(householdId, periodStart, amountMinor, userId) {
      const existing = store.budgets.find(
        (item) => item.householdId === householdId && item.periodStart.getTime() === periodStart.getTime(),
      );
      if (existing) {
        existing.amountMinor = amountMinor;
        existing.deletedAt = null;
        return { id: existing.id, amountMinor };
      }
      const created: FakeBudgetRow = {
        id: randomUUID(),
        householdId,
        periodStart,
        amountMinor,
        createdByUserId: userId,
      };
      store.budgets.push(created);
      return { id: created.id, amountMinor };
    },
    async softDeleteByPeriod(householdId, periodStart) {
      const row = store.budgets.find((item) => item.householdId === householdId && item.periodStart.getTime() === periodStart.getTime() && !item.deletedAt);
      if (!row) return false;
      row.deletedAt = new Date();
      return true;
    },
    async restoreByPeriod(householdId, periodStart) {
      const row = store.budgets.find((item) => item.householdId === householdId && item.periodStart.getTime() === periodStart.getTime() && !!item.deletedAt);
      if (!row) return false;
      row.deletedAt = null;
      return true;
    },
  };

  const personalBudget: PersonalBudgetRepository = {
    async findByPeriod(householdId, userId, periodStart) {
      const row = store.personalBudgets.find(
        (item) =>
          item.householdId === householdId &&
          item.userId === userId &&
          item.periodStart.getTime() === periodStart.getTime() && !item.deletedAt,
      );
      return row ? { id: row.id, amountMinor: row.amountMinor, periodStart: row.periodStart } : null;
    },
    async upsert(householdId, userId, periodStart, amountMinor, createdByUserId) {
      const existing = store.personalBudgets.find(
        (item) =>
          item.householdId === householdId &&
          item.userId === userId &&
          item.periodStart.getTime() === periodStart.getTime(),
      );
      if (existing) {
        existing.amountMinor = amountMinor;
        existing.deletedAt = null;
        return { id: existing.id, amountMinor };
      }
      const created: FakePersonalBudgetRow = {
        id: randomUUID(),
        householdId,
        userId,
        periodStart,
        amountMinor,
        createdByUserId,
      };
      store.personalBudgets.push(created);
      return { id: created.id, amountMinor };
    },
    async softDeleteByPeriod(householdId, userId, periodStart) {
      const row = store.personalBudgets.find((item) => item.householdId === householdId && item.userId === userId && item.periodStart.getTime() === periodStart.getTime() && !item.deletedAt);
      if (!row) return false;
      row.deletedAt = new Date();
      return true;
    },
    async restoreByPeriod(householdId, userId, periodStart) {
      const row = store.personalBudgets.find((item) => item.householdId === householdId && item.userId === userId && item.periodStart.getTime() === periodStart.getTime() && !!item.deletedAt);
      if (!row) return false;
      row.deletedAt = null;
      return true;
    },
  };

  const householdCycle: BudgetCycleRepository = {
    async findHousehold(householdId) {
      return store.householdCycles.get(householdId) ?? null;
    },
    async updateHousehold(householdId, input) {
      store.householdCycles.set(householdId, { ...input });
    },
  };

  const personalCycle: PersonalBudgetCycleRepository = {
    async findByUser(_householdId, userId) {
      return store.personalCycles.get(userId) ?? null;
    },
    async updateUser(userId, input) {
      store.personalCycles.set(userId, { ...input });
    },
  };

  return {
    store,
    transaction,
    wallet,
    goal,
    budget,
    personalBudget,
    householdCycle,
    personalCycle,
  };
}

/** Builds a stored transaction with sensible defaults for dashboard fixtures. */
export function fakeTransaction(overrides: Partial<TransactionRecord>): TransactionRecord {
  const now = new Date();
  return {
    id: randomUUID(),
    householdId: "hh",
    createdByUserId: "uu",
    type: "MONEY_OUT",
    amountMinor: 0,
    currencyCode: "IDR",
    category: null,
    merchant: null,
    note: null,
    occurredAt: now,
    source: "MANUAL",
    receiptId: null,
    transferGroupId: null,
    walletId: DEFAULT_WALLET_ID,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
