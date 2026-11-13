/*
  Monthly report service (feat-reporting AC-F7-1..15).

  The server is the only source of numbers: this service turns one aggregate
  read into the DTO the Ringkasan tab renders. The client never receives rows
  to sum. Scope and wallet are resolved before aggregation, so Bersama and
  Pribadi can never be combined (A-44).
*/

import { shiftMonthKey } from "@/lib/dates";
import { roundMoneyValue } from "@/lib/money-input";
import type { MonthlyReportDTO, ReportBreakdownDTO, ReportCategoryDTO } from "@/types/api";
import { notFound, reportScopeUnavailable } from "../errors";
import { jakartaDateOnly } from "../jakarta";
import type { ReportCategorySum, ReportRepository } from "../repositories/reports";
import type { WalletActor } from "../repositories/ledger";
import { PeriodService, addDaysToDateOnly, type MonthPeriod } from "./period";
import type { ActivityWalletSummaryQuery } from "../contracts/reports";

export interface MonthlyReportOptions {
  month?: string;
  /* Inclusive date range; takes precedence over `month` when both are present. */
  from?: string;
  to?: string;
  scope?: "all" | "shared" | "personal";
  walletId?: string;
  walletIds?: string[];
  transferWalletIds?: string[];
}

export interface MonthlyReportSelectionOptions {
  month?: string;
  from?: string;
  to?: string;
  scope: "all" | "shared" | "personal";
  walletIds: string[];
}

function daysInclusive(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

function categoryName(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function toBreakdown(
  rows: ReportCategorySum[],
  type: "MONEY_IN" | "MONEY_OUT",
  totalMinor: number,
  transferMinor = 0,
): ReportBreakdownDTO {
  const named: ReportCategoryDTO[] = [];
  let uncategorizedMinor = 0;

  for (const row of rows) {
    if (row.type !== type) continue;
    const name = categoryName(row.category);
    if (name === null) {
      uncategorizedMinor = roundMoneyValue(uncategorizedMinor + row.amountMinor);
      continue;
    }
    named.push({ name, amountMinor: roundMoneyValue(row.amountMinor) });
  }

  named.sort((a, b) => {
    if (b.amountMinor !== a.amountMinor) return b.amountMinor - a.amountMinor;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  const categories = named.slice(0, 4);
  const rest = named.slice(4);
  return {
    totalMinor,
    categories,
    uncategorizedMinor: roundMoneyValue(uncategorizedMinor + transferMinor),
    otherCategoryCount: rest.length,
    otherAmountMinor: roundMoneyValue(rest.reduce((total, row) => total + row.amountMinor, 0)),
  };
}

export class ReportService {
  constructor(
    private readonly repo: ReportRepository,
    private readonly periods: PeriodService = new PeriodService(),
  ) {}

  async activityWalletSummary(actor: WalletActor, options: ActivityWalletSummaryQuery) {
    const walletIds = [...new Set(options.walletIds)];
    const scope = options.scope === "personal" ? "PERSONAL" : options.scope === "shared" ? "SHARING" : "all";
    if (walletIds.length > 0) {
      const visibleIds = await this.repo.listVisibleWalletIds(actor, walletIds, scope);
      if (visibleIds.length !== walletIds.length) throw notFound("Dompet tidak ditemukan.");
    }
    const period = this.periods.month(options.month);
    return this.repo.activityWalletSummary(actor, { period, walletIds, scope });
  }

  async getSelection(actor: WalletActor, options: MonthlyReportSelectionOptions): Promise<MonthlyReportDTO> {
    const month = options.month ?? jakartaDateOnly().slice(0, 7);
    const selectedIds = [...new Set(options.walletIds)];
    const scopes: Array<"PERSONAL" | "SHARING"> =
      options.scope === "all" ? ["SHARING", "PERSONAL"] : [options.scope === "personal" ? "PERSONAL" : "SHARING"];
    const walletsByScope = await Promise.all(scopes.map(async (scope) => ({
      scope,
      wallets: await this.repo.listScopedWallets(actor, scope, undefined, selectedIds.length ? selectedIds : undefined),
    })));
    const selectedWallets = walletsByScope.flatMap(({ wallets }) => wallets);
    if (selectedIds.length > 0 && selectedWallets.length !== selectedIds.length) {
      throw notFound("Dompet tidak ditemukan.");
    }
    if (options.scope === "personal" && selectedWallets.length === 0) {
      throw reportScopeUnavailable();
    }

    const transferWalletIds = selectedIds.length > 0 ? selectedIds : undefined;
    const reportScopes = walletsByScope.filter((item) => item.wallets.length > 0);
    if (reportScopes.length === 0) reportScopes.push({ scope: scopes[0] ?? "SHARING", wallets: [] });

    const reports = await Promise.all(reportScopes.map(({ scope, wallets }) =>
      this.get(actor, {
        month,
        from: options.from,
        to: options.to,
        scope: scope === "PERSONAL" ? "personal" : "shared",
        walletIds: wallets.length ? wallets.map((wallet) => wallet.id) : undefined,
        transferWalletIds,
      }),
    ));
    const combined = combineMonthlyReports(reports, options.scope === "all" ? "ALL" : options.scope === "personal" ? "PERSONAL" : "SHARED");
    if (selectedIds.length === 1) {
      const selected = selectedWallets[0];
      combined.wallet = selected ? { id: selected.id, name: selected.name } : null;
    }
    return combined;
  }

  async get(actor: WalletActor, options: MonthlyReportOptions = {}): Promise<MonthlyReportDTO> {
    const month = options.month ?? jakartaDateOnly().slice(0, 7);
    const scope = options.scope === "personal" ? "PERSONAL" : "SHARING";
    const today = jakartaDateOnly();
    let period: MonthPeriod;
    let previous: MonthPeriod;
    let periodMonth = month;
    if (options.from && options.to) {
      period = this.periods.range(options.from, options.to);
      const length = daysInclusive(options.from, options.to);
      const previousEnd = addDaysToDateOnly(options.from, -1);
      const previousStart = addDaysToDateOnly(previousEnd, -(length - 1));
      previous = this.periods.range(previousStart, previousEnd);
      periodMonth = options.to.slice(0, 7);
    } else {
      period = this.periods.month(month);
      previous = this.periods.month(shiftMonthKey(month, -1));
    }

    const wallets = await this.repo.listScopedWallets(actor, scope, options.walletId, options.walletIds);
    if (options.walletId && wallets.length === 0) {
      throw notFound("Dompet tidak ditemukan.");
    }
    if (scope === "PERSONAL" && wallets.length === 0) {
      throw reportScopeUnavailable();
    }

    const aggregate = await this.repo.aggregate(actor, {
      scope,
      walletId: options.walletId,
      walletIds: options.walletIds,
      transferWalletIds: options.transferWalletIds ?? options.walletIds ?? (options.walletId ? [options.walletId] : undefined),
      period,
      previous,
    });

    const closingMinor = roundMoneyValue(
      aggregate.openingMinor +
      aggregate.newWalletOpeningMinor +
      aggregate.moneyInMinor -
      aggregate.moneyOutMinor +
      aggregate.transferInMinor -
      aggregate.transferOutMinor,
    );
    const selectedWallet = options.walletId ? wallets[0] : options.walletIds?.length === 1 ? wallets[0] : undefined;
    const incomeTotal = aggregate.moneyInMinor + aggregate.transferInMinor;
    const expenseTotal = aggregate.moneyOutMinor + aggregate.transferOutMinor;

    return {
      month: periodMonth,
      periodStart: period.periodStartDateOnly,
      periodEnd: period.periodEndDateOnly,
      isCurrentMonth: period.periodStartDateOnly <= today && today <= period.periodEndDateOnly,
      scope: scope === "SHARING" ? "SHARED" : "PERSONAL",
      wallet: selectedWallet ? { id: selectedWallet.id, name: selectedWallet.name } : null,
      openingMinor: aggregate.openingMinor,
      newWalletOpeningMinor: aggregate.newWalletOpeningMinor,
      moneyInMinor: aggregate.moneyInMinor,
      moneyOutMinor: aggregate.moneyOutMinor,
      transferInMinor: aggregate.transferInMinor,
      transferOutMinor: aggregate.transferOutMinor,
      transferNetMinor: roundMoneyValue(aggregate.transferInMinor - aggregate.transferOutMinor),
      closingMinor,
      transactionCount: aggregate.transactionCount,
      hasBackdatedNewWallet: aggregate.hasBackdatedNewWallet,
      delta: aggregate.previous.hasData
        ? {
            closingMinor: roundMoneyValue(closingMinor - aggregate.previous.closingMinor),
            moneyInMinor: roundMoneyValue(incomeTotal - aggregate.previous.moneyInMinor - aggregate.previous.transferInMinor),
            moneyOutMinor: roundMoneyValue(expenseTotal - aggregate.previous.moneyOutMinor - aggregate.previous.transferOutMinor),
          }
        : { closingMinor: null, moneyInMinor: null, moneyOutMinor: null },
      income: toBreakdown(aggregate.categories, "MONEY_IN", incomeTotal, aggregate.transferInMinor),
      expense: toBreakdown(aggregate.categories, "MONEY_OUT", expenseTotal, aggregate.transferOutMinor),
      dailyBalances: aggregate.dailyBalances,
    };
  }
}

function combineMonthlyReports(reports: MonthlyReportDTO[], scope: MonthlyReportDTO["scope"]): MonthlyReportDTO {
  const first = reports[0];
  if (!first) throw new Error("Ringkasan bulanan kosong.");
  const combineBreakdown = (key: "income" | "expense") => {
    const entries = new Map<string, number>();
    for (const report of reports) {
      for (const item of report[key].categories) {
        entries.set(item.name, (entries.get(item.name) ?? 0) + item.amountMinor);
      }
    }
    const sorted = [...entries].map(([name, amountMinor]) => ({ name, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name, "id"));
    const top = sorted.slice(0, 4);
    const remainder = sorted.slice(4);
    return {
      totalMinor: reports.reduce((sum, report) => sum + report[key].totalMinor, 0),
      categories: top,
      uncategorizedMinor: reports.reduce((sum, report) => sum + report[key].uncategorizedMinor, 0),
      otherCategoryCount: reports.reduce((sum, report) => sum + report[key].otherCategoryCount, 0) + remainder.length,
      otherAmountMinor: reports.reduce((sum, report) => sum + report[key].otherAmountMinor, 0) + remainder.reduce((sum, row) => sum + row.amountMinor, 0),
    };
  };
  const daily = new Map<string, number>();
  for (const report of reports) {
    for (const point of report.dailyBalances) daily.set(point.date, (daily.get(point.date) ?? 0) + point.closingMinor);
  }
  const add = (key: "openingMinor" | "newWalletOpeningMinor" | "moneyInMinor" | "moneyOutMinor" | "transferInMinor" | "transferOutMinor" | "transferNetMinor" | "closingMinor" | "transactionCount") =>
    reports.reduce((sum, report) => sum + report[key], 0);
  const sumDelta = (key: "closingMinor" | "moneyInMinor" | "moneyOutMinor") =>
    reports.every((report) => report.delta[key] === null)
      ? null
      : reports.reduce((sum, report) => sum + (report.delta[key] ?? 0), 0);
  return {
    ...first,
    scope,
    wallet: null,
    openingMinor: add("openingMinor"),
    newWalletOpeningMinor: add("newWalletOpeningMinor"),
    moneyInMinor: add("moneyInMinor"),
    moneyOutMinor: add("moneyOutMinor"),
    transferInMinor: add("transferInMinor"),
    transferOutMinor: add("transferOutMinor"),
    transferNetMinor: add("transferNetMinor"),
    closingMinor: add("closingMinor"),
    transactionCount: add("transactionCount"),
    hasBackdatedNewWallet: reports.some((report) => report.hasBackdatedNewWallet),
    delta: {
      closingMinor: sumDelta("closingMinor"),
      moneyInMinor: sumDelta("moneyInMinor"),
      moneyOutMinor: sumDelta("moneyOutMinor"),
    },
    income: combineBreakdown("income"),
    expense: combineBreakdown("expense"),
    dailyBalances: [...daily].map(([date, closingMinor]) => ({ date, closingMinor })),
  };
}
