/*
  DashboardService (feat-dashboard AC-F2-*; T-009 AC-F6-7/AC-F6-8/AC-F6-11).

  One server-side aggregation is the single source of truth. Per A-44 the two
  balance totals are reported separately and never summed: `sharedBalanceMinor`
  over SHARING wallets (active AND archived) and `personalBalanceMinor` over the
  caller's PERSONAL wallets. The carousel (`wallets`) contains active wallets
  only. Spending/budget are SHARING-only (A-45) and the recent activity list
  applies the A-39 redaction.
*/

import { jakartaDateOnly } from "../jakarta";
import { roundMoneyValue } from "@/lib/money-input";
import type { GoalRepository, TransactionRepository, WalletActor, WalletRepository } from "../repositories/ledger";
import type { DashboardDTO, GoalSummaryDTO, SpendingDayDTO, WalletCardDTO } from "@/types/api";
import { BudgetService } from "./budget";
import { PeriodService } from "./period";
import { decorateTransactionRows } from "./transaction";

/** The dashboard previews the newest few rows; the full list lives on /transactions. */
const RECENT_ACTIVITY_LIMIT = 5;

export interface DashboardOptions {
  /** Chart window in Asia/Jakarta calendar days (7 / 30 / 90). */
  periodDays?: number;
  now?: Date;
}

export class DashboardService {
  constructor(
    private readonly repos: { transaction: TransactionRepository; wallet: WalletRepository },
    private readonly goals: GoalRepository,
    private readonly budget: BudgetService,
    private readonly periods: PeriodService = new PeriodService(),
  ) {}

  async get(actor: WalletActor, options: DashboardOptions = {}): Promise<DashboardDTO> {
    const now = options.now ?? new Date();
    const periodDays = options.periodDays ?? 7;
    const spendingPeriod = this.periods.lastNDays(now, periodDays);
    const timings: Record<string, number> = {};
    const timed = async <T>(name: string, work: Promise<T>): Promise<T> => {
      const startedAt = performance.now();
      const result = await work;
      timings[name] = performance.now() - startedAt;
      return result;
    };

    const [
      wallets,
      balances,
      monthlyBudget,
      personalMonthlyBudget,
      spendingRows,
      goalRows,
      activity,
    ] = await Promise.all([
      timed("wallets", this.repos.wallet.list(actor, "all")),
      timed("balances", this.repos.wallet.balances(actor.householdId)),
      timed("sharedBudget", this.budget.get(actor.householdId, now)),
      timed("personalBudget", this.budget.getPersonal(actor, now)),
      timed("spending", this.repos.transaction.listDashboardSpending
        ? this.repos.transaction.listDashboardSpending(actor, {
            from: spendingPeriod.start,
            to: spendingPeriod.end,
          })
        : Promise.all([
            this.repos.transaction.listByDay(
              actor.householdId,
              { from: spendingPeriod.start, to: spendingPeriod.end },
              { walletScope: "SHARING" },
            ),
            this.repos.transaction.listByDay(
              actor.householdId,
              { from: spendingPeriod.start, to: spendingPeriod.end },
              { walletScope: "PERSONAL", walletOwnerUserId: actor.userId },
            ),
          ]).then(([shared, personal]) => [
            ...shared.map((row) => ({ ...row, scope: "SHARING" as const })),
            ...personal.map((row) => ({ ...row, scope: "PERSONAL" as const })),
          ])),
      timed("goals", this.goals.listActive(actor.householdId)),
      timed("activity", this.repos.transaction.listActive(actor, { limit: RECENT_ACTIVITY_LIMIT })),
    ]);

    const balanceMap = new Map(balances.map((row) => [row.walletId, row.balanceMinor]));
    let sharedBalanceMinor = 0;
    let personalBalanceMinor = 0;
    const cards: WalletCardDTO[] = [];
    for (const wallet of wallets) {
      const balance = balanceMap.get(wallet.id) ?? wallet.openingBalanceMinor;
      if (wallet.scope === "SHARING") sharedBalanceMinor = roundMoneyValue(sharedBalanceMinor + balance);
      else personalBalanceMinor = roundMoneyValue(personalBalanceMinor + balance);
      /* Carousel: active only (C-18); archived balances still counted above. */
      if (!wallet.archivedAt) {
        cards.push({
          id: wallet.id,
          name: wallet.name,
          purpose: wallet.purpose,
          scope: wallet.scope,
          balanceMinor: balance,
          archivedAt: null,
          canEdit: wallet.scope === "SHARING" || wallet.createdByUserId === actor.userId,
          canArchive: wallet.scope === "PERSONAL"
            ? wallet.createdByUserId === actor.userId
            : wallet.createdByUserId === actor.userId || actor.role === "OWNER",
          canRestore: wallet.scope === "PERSONAL"
            ? wallet.createdByUserId === actor.userId
            : wallet.createdByUserId === actor.userId || actor.role === "OWNER",
          institution: wallet.institution
            ? { kind: wallet.institution.kind, name: wallet.institution.name }
            : null,
        });
      }
    }

    const dailyRows = spendingRows.filter((row) => row.scope === "SHARING");
    const personalDailyRows = spendingRows.filter((row) => row.scope === "PERSONAL");
    const byDay = bucketByJakartaDay(spendingPeriod.buckets, dailyRows);
    const totalOutMinor = roundMoneyValue(byDay.reduce((total, day) => total + day.amountMinor, 0));
    const personalByDay = bucketByJakartaDay(spendingPeriod.buckets, personalDailyRows);
    const personalTotalOutMinor = roundMoneyValue(personalByDay.reduce((total, day) => total + day.amountMinor, 0));

    const recentActivity = await timed(
      "decorateActivity",
      decorateTransactionRows(this.repos, actor, activity.rows),
    );
    console.info("dashboard_timing", {
      timings: Object.fromEntries(
        Object.entries(timings).map(([name, duration]) => [name, Number(duration.toFixed(1))]),
      ),
    });

    return {
      sharedBalanceMinor,
      personalBalanceMinor,
      currencyCode: "IDR",
      wallets: cards,
      monthlyBudget,
      personalMonthlyBudget,
      spending: {
        periodStart: spendingPeriod.periodStartDateOnly,
        periodEnd: spendingPeriod.periodEndDateOnly,
        totalOutMinor,
        byDay,
      },
      personalSpending: {
        periodStart: spendingPeriod.periodStartDateOnly,
        periodEnd: spendingPeriod.periodEndDateOnly,
        totalOutMinor: personalTotalOutMinor,
        byDay: personalByDay,
      },
      goals: goalRows.map(toGoalSummaryDTO),
      recentActivity,
    };
  }
}

/**
 * Folds per-timestamp sums into the Jakarta calendar-day buckets, keeping empty
 * days as zero so the chart axis never drops a day (AC-F2-5). Bucketing runs in
 * the application layer, not the database.
 */
export function bucketByJakartaDay(
  buckets: string[],
  rows: Array<{ date: Date; amountMinor: number }>,
): SpendingDayDTO[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = jakartaDateOnly(row.date);
    totals.set(key, roundMoneyValue((totals.get(key) ?? 0) + row.amountMinor));
  }
  return buckets.map((date) => ({ date, amountMinor: totals.get(date) ?? 0 }));
}

/** Caps progress at 100 in the DTO while leaving the stored value untouched (AC-F2-9). */
export function toGoalSummaryDTO(goal: {
  id: string;
  name: string;
  targetAmountMinor: number;
  savedAmountMinor: number;
  deadline: Date | null;
}): GoalSummaryDTO {
  const progressPercent =
    goal.targetAmountMinor > 0
      ? Math.min(100, Math.round((goal.savedAmountMinor / goal.targetAmountMinor) * 100))
      : 0;
  return {
    id: goal.id,
    name: goal.name,
    targetAmountMinor: goal.targetAmountMinor,
    savedAmountMinor: goal.savedAmountMinor,
    currencyCode: "IDR",
    deadline: goal.deadline ? goal.deadline.toISOString().slice(0, 10) : null,
    progressPercent,
  };
}
