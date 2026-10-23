/*
  BudgetService (feat-dashboard AC-F2-2, AC-F2-3; T-015 AC-F2-2c).

  Two independent scopes share the same Asia/Jakarta month window:
  - SHARED reads `household_budget` and SHARING wallets; writing stays OWNER-only.
  - PERSONAL reads `personal_budget` for the session user and that user's
    PERSONAL wallets. Any approved member may write their own row; the owner has
    no override and no request field can select another user.

  Spent/remaining come from active MONEY_OUT rows, excluding transfer legs (the
  repository enforces that, AC-F2-4). When no row exists the DTO reports
  `isSet: false` with null amounts so the UI shows "atur budget" instead of a
  misleading Rp0.
*/

import { forbidden, unprocessable } from "../errors";
import type {
  BudgetRepository,
  PersonalBudgetRepository,
  TransactionRepository,
} from "../repositories/ledger";
import type { MonthlyBudgetDTO } from "@/types/api";
import { PeriodService } from "./period";

export type BudgetActor = { userId: string; role: string; householdId: string };
/** Personal reads only need the session identity, never a membership role. */
export type PersonalBudgetActor = Pick<BudgetActor, "userId" | "householdId">;

/** Wire-level scope names (lowercase) map to the DTO scope (uppercase). */
export type BudgetScope = "PERSONAL" | "SHARED";

const OWNER_DENIED = "Hanya pemilik keluarga yang dapat mengatur budget.";

export class BudgetService {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly personalBudgets: PersonalBudgetRepository,
    private readonly transactions: TransactionRepository,
    private readonly periods: PeriodService = new PeriodService(),
  ) {}

  /** Current-month SHARED budget plus spent/remaining (AC-F2-2). */
  async get(householdId: string, now: Date = new Date()): Promise<MonthlyBudgetDTO> {
    const period = this.periods.currentMonth(now);
    const [row, spentMinor] = await Promise.all([
      this.budgets.findByPeriod(householdId, period.budgetPeriodStart),
      this.transactions.sumByType(
        householdId,
        {
          type: "MONEY_OUT",
          from: period.start,
          to: period.end,
        },
        { walletScope: "SHARING" },
      ),
    ]);
    return {
      periodStart: period.periodStartDateOnly,
      periodEnd: period.periodEndDateOnly,
      scope: "SHARED",
      isSet: row !== null,
      budgetMinor: row?.amountMinor ?? null,
      spentMinor,
      remainingMinor: row ? row.amountMinor - spentMinor : null,
      currencyCode: "IDR",
    };
  }

  /**
   * Current-month PERSONAL budget for the actor (T-015). The household and user
   * always come from the session actor; there is no userId parameter.
   */
  async getPersonal(actor: PersonalBudgetActor, now: Date = new Date()): Promise<MonthlyBudgetDTO> {
    const period = this.periods.currentMonth(now);
    const [row, spentMinor] = await Promise.all([
      this.personalBudgets.findByPeriod(actor.householdId, actor.userId, period.budgetPeriodStart),
      this.transactions.sumByType(
        actor.householdId,
        {
          type: "MONEY_OUT",
          from: period.start,
          to: period.end,
        },
        { walletScope: "PERSONAL", walletOwnerUserId: actor.userId },
      ),
    ]);
    return {
      periodStart: period.periodStartDateOnly,
      periodEnd: period.periodEndDateOnly,
      scope: "PERSONAL",
      isSet: row !== null,
      budgetMinor: row?.amountMinor ?? null,
      spentMinor,
      remainingMinor: row ? row.amountMinor - spentMinor : null,
      currencyCode: "IDR",
    };
  }

  /**
   * Upsert the current month for one scope. SHARED keeps the OWNER-only rule
   * (AC-F2-3); PERSONAL writes only the actor's own row (AC-F2-2c).
   */
  async upsert(
    actor: BudgetActor,
    householdId: string,
    amountMinor: number,
    scope: BudgetScope = "SHARED",
    now: Date = new Date(),
  ): Promise<MonthlyBudgetDTO> {
    /* Shared keeps its original authorization order: member -> 403 first. */
    if (scope !== "PERSONAL" && actor.role !== "OWNER") {
      throw forbidden("ACCESS_DENIED", OWNER_DENIED);
    }
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw unprocessable({ amountMinor: ["Budget harus lebih dari 0."] });
    }

    if (scope === "PERSONAL") {
      const period = this.periods.currentMonth(now);
      /* Always the session household, never a caller-supplied scope. */
      await this.personalBudgets.upsert(
        actor.householdId,
        actor.userId,
        period.budgetPeriodStart,
        amountMinor,
        actor.userId,
      );
      return this.getPersonal({ userId: actor.userId, householdId: actor.householdId }, now);
    }

    const period = this.periods.currentMonth(now);
    await this.budgets.upsert(householdId, period.budgetPeriodStart, amountMinor, actor.userId);
    return this.get(householdId, now);
  }
}
