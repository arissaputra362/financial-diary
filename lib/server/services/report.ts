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
import { PeriodService } from "./period";

export interface MonthlyReportOptions {
  month?: string;
  scope?: "shared" | "personal";
  walletId?: string;
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
    uncategorizedMinor,
    otherCategoryCount: rest.length,
    otherAmountMinor: roundMoneyValue(rest.reduce((total, row) => total + row.amountMinor, 0)),
  };
}

export class ReportService {
  constructor(
    private readonly repo: ReportRepository,
    private readonly periods: PeriodService = new PeriodService(),
  ) {}

  async get(actor: WalletActor, options: MonthlyReportOptions = {}): Promise<MonthlyReportDTO> {
    const month = options.month ?? jakartaDateOnly().slice(0, 7);
    const scope = options.scope === "personal" ? "PERSONAL" : "SHARING";
    const period = this.periods.month(month);
    const previous = this.periods.month(shiftMonthKey(month, -1));

    const wallets = await this.repo.listScopedWallets(actor, scope, options.walletId);
    if (options.walletId && wallets.length === 0) {
      throw notFound("Dompet tidak ditemukan.");
    }
    if (scope === "PERSONAL" && wallets.length === 0) {
      throw reportScopeUnavailable();
    }

    const aggregate = await this.repo.aggregate(actor, {
      scope,
      walletId: options.walletId,
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
    const selectedWallet = options.walletId ? wallets[0] : undefined;

    return {
      month,
      periodStart: period.periodStartDateOnly,
      periodEnd: period.periodEndDateOnly,
      isCurrentMonth: month === jakartaDateOnly().slice(0, 7),
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
            moneyInMinor: roundMoneyValue(aggregate.moneyInMinor - aggregate.previous.moneyInMinor),
            moneyOutMinor: roundMoneyValue(aggregate.moneyOutMinor - aggregate.previous.moneyOutMinor),
          }
        : { closingMinor: null, moneyInMinor: null, moneyOutMinor: null },
      income: toBreakdown(aggregate.categories, "MONEY_IN", aggregate.moneyInMinor),
      expense: toBreakdown(aggregate.categories, "MONEY_OUT", aggregate.moneyOutMinor),
      dailyBalances: aggregate.dailyBalances,
    };
  }
}
