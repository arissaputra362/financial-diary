/*
  TEST-ONLY in-memory monthly report seam. Mirrors the SQL semantics in
  lib/server/repositories/reports.ts so route tests exercise the real service
  and the same invariant without a database. Never imported by application code.
*/

import type { DashboardFakeStore } from "./dashboard-fakes";
import type {
  ReportAggregate,
  ReportCategorySum,
  ReportRepository,
  ReportWalletRecord,
} from "../repositories/reports";
import type { TransactionRecord, WalletActor, WalletRecord } from "../repositories/ledger";
import { jakartaDateOnly } from "../jakarta";

export function fakeReportWallet(overrides: Partial<WalletRecord> = {}): WalletRecord {
  return {
    id: "w-shared",
    householdId: "hh",
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
    createdAt: new Date("2026-01-01T00:00:00+07:00"),
    updatedAt: new Date("2026-01-01T00:00:00+07:00"),
    ...overrides,
  };
}

function datesBetween(startDateOnly: string, endDateOnly: string): string[] {
  const [year, month, day] = startDateOnly.split("-").map(Number);
  const cursor = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const end = new Date(`${endDateOnly}T00:00:00.000Z`);
  const dates: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function activeInPeriod(rows: TransactionRecord[], walletIds: Set<string>, start: Date, end: Date) {
  return rows.filter(
    (row) =>
      row.deletedAt === null &&
      walletIds.has(row.walletId) &&
      row.occurredAt.getTime() >= start.getTime() &&
      row.occurredAt.getTime() <= end.getTime(),
  );
}

function netOf(rows: TransactionRecord[]): number {
  return rows.reduce(
    (total, row) => total + (row.type === "MONEY_IN" ? row.amountMinor : -row.amountMinor),
    0,
  );
}

export function createReportFake(store: DashboardFakeStore): ReportRepository {
  const scoped = (actor: WalletActor, scope: "PERSONAL" | "SHARING", walletId?: string) =>
    store.wallets.filter(
      (wallet) =>
        wallet.householdId === actor.householdId &&
        wallet.scope === scope &&
        (scope !== "PERSONAL" || wallet.createdByUserId === actor.userId) &&
        (!walletId || wallet.id === walletId),
    );

  const hasActiveInPeriod = (walletId: string, start: Date, end: Date) =>
    store.transactions.some(
      (row) =>
        row.walletId === walletId &&
        row.deletedAt === null &&
        row.occurredAt.getTime() >= start.getTime() &&
        row.occurredAt.getTime() <= end.getTime(),
    );

  return {
    async listScopedWallets(actor, scope, walletId) {
      return scoped(actor, scope, walletId).map<ReportWalletRecord>((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        scope: wallet.scope,
        openingBalanceMinor: wallet.openingBalanceMinor,
        archivedAt: wallet.archivedAt,
        createdAt: wallet.createdAt,
      }));
    },

    async aggregate(actor, { scope, walletId, period, previous }): Promise<ReportAggregate> {
      const wallets = scoped(actor, scope, walletId);
      const periodWallets = wallets.filter(
        (wallet) =>
          wallet.createdAt.getTime() <= period.end.getTime() ||
          hasActiveInPeriod(wallet.id, period.start, period.end),
      );
      const prevWallets = wallets.filter(
        (wallet) =>
          wallet.createdAt.getTime() <= previous.end.getTime() ||
          hasActiveInPeriod(wallet.id, previous.start, previous.end),
      );

      const periodIds = new Set(periodWallets.map((wallet) => wallet.id));
      const prevIds = new Set(prevWallets.map((wallet) => wallet.id));

      const periodTx = activeInPeriod(store.transactions, periodIds, period.start, period.end);
      const prevTx = activeInPeriod(store.transactions, prevIds, previous.start, previous.end);
      const beforeTx = store.transactions.filter(
        (row) =>
          row.deletedAt === null &&
          periodIds.has(row.walletId) &&
          row.occurredAt.getTime() < period.start.getTime(),
      );
      const prevBeforeTx = store.transactions.filter(
        (row) =>
          row.deletedAt === null &&
          prevIds.has(row.walletId) &&
          row.occurredAt.getTime() < previous.start.getTime(),
      );

      const openingMinor =
        periodWallets
          .filter((wallet) => wallet.createdAt.getTime() < period.start.getTime())
          .reduce((total, wallet) => total + wallet.openingBalanceMinor, 0) +
        netOf(beforeTx);
      const newWalletOpeningMinor = periodWallets
        .filter((wallet) => wallet.createdAt.getTime() >= period.start.getTime())
        .reduce((total, wallet) => total + wallet.openingBalanceMinor, 0);

      const moneyInMinor = periodTx
        .filter((row) => row.transferGroupId === null && row.type === "MONEY_IN")
        .reduce((total, row) => total + row.amountMinor, 0);
      const moneyOutMinor = periodTx
        .filter((row) => row.transferGroupId === null && row.type === "MONEY_OUT")
        .reduce((total, row) => total + row.amountMinor, 0);
      const transferInMinor = periodTx
        .filter((row) => row.transferGroupId !== null && row.type === "MONEY_IN")
        .reduce((total, row) => total + row.amountMinor, 0);
      const transferOutMinor = periodTx
        .filter((row) => row.transferGroupId !== null && row.type === "MONEY_OUT")
        .reduce((total, row) => total + row.amountMinor, 0);

      const prevOpening =
        prevWallets
          .filter((wallet) => wallet.createdAt.getTime() < previous.start.getTime())
          .reduce((total, wallet) => total + wallet.openingBalanceMinor, 0) +
        netOf(prevBeforeTx);
      const prevNewOpening = prevWallets
        .filter((wallet) => wallet.createdAt.getTime() >= previous.start.getTime())
        .reduce((total, wallet) => total + wallet.openingBalanceMinor, 0);
      const prevMoneyIn = prevTx
        .filter((row) => row.transferGroupId === null && row.type === "MONEY_IN")
        .reduce((total, row) => total + row.amountMinor, 0);
      const prevMoneyOut = prevTx
        .filter((row) => row.transferGroupId === null && row.type === "MONEY_OUT")
        .reduce((total, row) => total + row.amountMinor, 0);
      const prevTransferIn = prevTx
        .filter((row) => row.transferGroupId !== null && row.type === "MONEY_IN")
        .reduce((total, row) => total + row.amountMinor, 0);
      const prevTransferOut = prevTx
        .filter((row) => row.transferGroupId !== null && row.type === "MONEY_OUT")
        .reduce((total, row) => total + row.amountMinor, 0);

      const categoryMap = new Map<string, ReportCategorySum>();
      for (const row of periodTx) {
        if (row.transferGroupId !== null) continue;
        const key = `${row.type}:${row.category ?? ""}`;
        const current = categoryMap.get(key);
        if (current) current.amountMinor += row.amountMinor;
        else {
          categoryMap.set(key, {
            type: row.type,
            category: row.category,
            amountMinor: row.amountMinor,
          });
        }
      }

      const dailyDates = datesBetween(period.periodStartDateOnly, period.periodEndDateOnly);
      const dailyNet = new Map<string, number>();
      for (const row of periodTx) {
        const key = jakartaDateOnly(row.occurredAt);
        dailyNet.set(
          key,
          (dailyNet.get(key) ?? 0) + (row.type === "MONEY_IN" ? row.amountMinor : -row.amountMinor),
        );
      }
      let running = openingMinor + newWalletOpeningMinor;
      const dailyBalances = dailyDates.map((date) => {
        running += dailyNet.get(date) ?? 0;
        return { date, closingMinor: running };
      });

      const hasBackdatedNewWallet = periodWallets.some(
        (wallet) =>
          wallet.createdAt.getTime() >= period.start.getTime() &&
          store.transactions.some(
            (row) =>
              row.walletId === wallet.id &&
              row.deletedAt === null &&
              row.occurredAt.getTime() < wallet.createdAt.getTime(),
          ),
      );

      const previousClosing =
        prevOpening + prevNewOpening + prevMoneyIn - prevMoneyOut + prevTransferIn - prevTransferOut;

      return {
        openingMinor,
        newWalletOpeningMinor,
        moneyInMinor,
        moneyOutMinor,
        transferInMinor,
        transferOutMinor,
        transactionCount: periodTx.length,
        hasBackdatedNewWallet,
        categories: [...categoryMap.values()],
        dailyBalances,
        previous: {
          hasData: prevTx.length > 0,
          closingMinor: previousClosing,
          moneyInMinor: prevMoneyIn,
          moneyOutMinor: prevMoneyOut,
        },
      };
    },
  };
}
