/*
  BudgetService (feat-dashboard AC-F2-2, AC-F2-3, AC-F2-2c, AC-F2-2d).

  Two independent scopes share the same Asia/Jakarta period rules but keep their
  own cycle setting:
  - SHARED reads `household_budget` and SHARING wallets; writing stays OWNER-only.
  - PERSONAL reads `personal_budget` for the session user and that user's
    PERSONAL wallets. Any approved member may write their own row; the owner has
    no override and no request field can select another user.

  A cycle change waits for the next period when the current period already has a
  budget, so its amount and spending range never move. When the current period
  has no budget yet, the change applies immediately because there is no amount
  to protect. A budget row is keyed by the actual period start date, so a new
  cycle starts "belum diatur" instead of silently inheriting an older amount.

  Spent/remaining come from active MONEY_OUT rows, excluding transfer legs (the
  repository enforces that, AC-F2-4). When no row exists the DTO reports
  `isSet: false` with null amounts so the UI shows "atur budget" instead of a
  misleading Rp0.
*/

import { jakartaDateOnly } from "../jakarta";
import { forbidden, notFound, unprocessable } from "../errors";
import type {
  BudgetCycleRepository,
  BudgetCycleSettingsRecord,
  BudgetCycleWrite,
  BudgetRepository,
  PersonalBudgetCycleRepository,
  PersonalBudgetRepository,
  TransactionRepository,
} from "../repositories/ledger";
import type { BudgetCycleDTO, MonthlyBudgetDTO } from "@/types/api";
import {
  DEFAULT_BUDGET_CYCLE,
  MAX_FIXED_DAY,
  PeriodService,
  type BudgetCycle,
} from "./period";
import { hasAtMostTwoDecimals, roundMoneyValue } from "@/lib/money-input";

export type BudgetActor = { userId: string; role: string; householdId: string };
/** Personal reads only need the session identity, never a membership role. */
export type PersonalBudgetActor = Pick<BudgetActor, "userId" | "householdId">;

/** Wire-level scope names (lowercase) map to the DTO scope (uppercase). */
export type BudgetScope = "PERSONAL" | "SHARED";

const OWNER_DENIED = "Hanya pemilik keluarga yang dapat mengatur budget.";

interface ResolvedCycle {
  /** Cycle that owns today's period. */
  active: BudgetCycle;
  /** A later cycle waiting for its effective date, if any. */
  pending: { cycle: BudgetCycle; effectiveFrom: string } | null;
  /** True when a pending cycle has reached its effective date. */
  effective: boolean;
}

function cycleFrom(mode: BudgetCycleWrite["mode"], day: number | null): BudgetCycle {
  return mode === "FIXED_DAY" ? { mode, day } : { mode, day: null };
}

function cycleDTO(cycle: BudgetCycle): BudgetCycleDTO {
  return { mode: cycle.mode, day: cycle.mode === "FIXED_DAY" ? cycle.day : null };
}

/** Resolves the cycle for `today` without mutating storage on a read. */
function resolveCycle(
  settings: BudgetCycleSettingsRecord | null,
  today: string,
): ResolvedCycle {
  if (!settings) return { active: DEFAULT_BUDGET_CYCLE, pending: null, effective: false };

  const active = cycleFrom(settings.mode, settings.day);
  if (!settings.pendingMode || !settings.pendingEffectiveFrom) {
    return { active, pending: null, effective: false };
  }

  const pendingCycle = cycleFrom(settings.pendingMode, settings.pendingDay);
  const effectiveFrom = settings.pendingEffectiveFrom.toISOString().slice(0, 10);
  if (effectiveFrom <= today) {
    return { active: pendingCycle, pending: null, effective: true };
  }
  return {
    active,
    pending: { cycle: pendingCycle, effectiveFrom },
    effective: false,
  };
}

function normalizeCycle(input: BudgetCycle): BudgetCycle {
  if (input.mode === "FIXED_DAY") {
    if (
      input.day === null ||
      !Number.isInteger(input.day) ||
      input.day < 1 ||
      input.day > MAX_FIXED_DAY
    ) {
      throw unprocessable({
        day: [`Tanggal harus antara 1 dan ${MAX_FIXED_DAY}.`],
      });
    }
    return { mode: "FIXED_DAY", day: input.day };
  }
  return { mode: input.mode, day: null };
}

function sameCycle(left: BudgetCycle, right: BudgetCycle): boolean {
  return left.mode === right.mode && left.day === right.day;
}

export class BudgetService {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly personalBudgets: PersonalBudgetRepository,
    private readonly transactions: TransactionRepository,
    private readonly householdCycles: BudgetCycleRepository,
    private readonly personalCycles: PersonalBudgetCycleRepository,
    private readonly periods: PeriodService = new PeriodService(),
  ) {}

  /** Current SHARED budget plus spent/remaining (AC-F2-2, AC-F2-2d). */
  async get(householdId: string, now: Date = new Date()): Promise<MonthlyBudgetDTO> {
    const today = jakartaDateOnly(now);
    const resolved = resolveCycle(await this.householdCycles.findHousehold(householdId), today);
    const period = this.periods.periodForDateOnly(today, resolved.active);
    const [row, regularSpentMinor, transferredToPersonalMinor] = await Promise.all([
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
      this.transactions.sumTransfersFromSharedToPersonal(householdId, {
        from: period.start,
        to: period.end,
      }),
    ]);
    const spentMinor = roundMoneyValue(regularSpentMinor + transferredToPersonalMinor);
    return {
      periodStart: period.periodStartDateOnly,
      periodEnd: period.periodEndDateOnly,
      scope: "SHARED",
      isSet: row !== null,
      budgetMinor: row?.amountMinor ?? null,
      spentMinor,
      remainingMinor: row ? roundMoneyValue(row.amountMinor - spentMinor) : null,
      currencyCode: "IDR",
      cycle: cycleDTO(resolved.active),
      nextCycle: resolved.pending
        ? {
            ...cycleDTO(resolved.pending.cycle),
            effectiveFrom: resolved.pending.effectiveFrom,
          }
        : null,
    };
  }

  /**
   * Current PERSONAL budget for the actor (T-015). The household and user
   * always come from the session actor; there is no userId parameter.
   */
  async getPersonal(actor: PersonalBudgetActor, now: Date = new Date()): Promise<MonthlyBudgetDTO> {
    const today = jakartaDateOnly(now);
    const resolved = resolveCycle(
      await this.personalCycles.findByUser(actor.householdId, actor.userId),
      today,
    );
    const period = this.periods.periodForDateOnly(today, resolved.active);
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
      remainingMinor: row ? roundMoneyValue(row.amountMinor - spentMinor) : null,
      currencyCode: "IDR",
      cycle: cycleDTO(resolved.active),
      nextCycle: resolved.pending
        ? {
            ...cycleDTO(resolved.pending.cycle),
            effectiveFrom: resolved.pending.effectiveFrom,
          }
        : null,
    };
  }

  /**
   * Upsert the current period for one scope. SHARED keeps the OWNER-only rule
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
    if (!hasAtMostTwoDecimals(amountMinor) || amountMinor <= 0) {
      throw unprocessable({ amountMinor: ["Budget harus lebih dari 0."] });
    }

    if (scope === "PERSONAL") {
      const today = jakartaDateOnly(now);
      const resolved = resolveCycle(
        await this.personalCycles.findByUser(actor.householdId, actor.userId),
        today,
      );
      const period = this.periods.periodForDateOnly(today, resolved.active);
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

    const today = jakartaDateOnly(now);
    const resolved = resolveCycle(await this.householdCycles.findHousehold(householdId), today);
    const period = this.periods.periodForDateOnly(today, resolved.active);
    await this.budgets.upsert(householdId, period.budgetPeriodStart, amountMinor, actor.userId);
    return this.get(householdId, now);
  }

  /**
   * Change the cycle for one scope (AC-F2-2d). SHARED is OWNER-only; PERSONAL
   * only changes the session user's own cycle. With a budget in the current
   * period the change starts at the next boundary, so visible numbers never
   * move; without one it applies to the current period immediately.
   */
  async updateCycle(
    actor: BudgetActor,
    householdId: string,
    input: BudgetCycle,
    scope: BudgetScope = "SHARED",
    now: Date = new Date(),
  ): Promise<MonthlyBudgetDTO> {
    if (scope !== "PERSONAL" && actor.role !== "OWNER") {
      throw forbidden("ACCESS_DENIED", OWNER_DENIED);
    }

    const requested = normalizeCycle(input);
    const today = jakartaDateOnly(now);

    if (scope === "PERSONAL") {
      const settings = await this.personalCycles.findByUser(actor.householdId, actor.userId);
      const resolved = resolveCycle(settings, today);
      const hasCurrentBudget =
        (await this.personalBudgets.findByPeriod(
          actor.householdId,
          actor.userId,
          this.periods.periodForDateOnly(today, resolved.active).budgetPeriodStart,
        )) !== null;
      const write = this.cycleWrite(resolved, today, requested, hasCurrentBudget);
      await this.personalCycles.updateUser(actor.userId, write);
      return this.getPersonal({ userId: actor.userId, householdId: actor.householdId }, now);
    }

    const settings = await this.householdCycles.findHousehold(householdId);
    const resolved = resolveCycle(settings, today);
    const hasCurrentBudget =
      (await this.budgets.findByPeriod(
        householdId,
        this.periods.periodForDateOnly(today, resolved.active).budgetPeriodStart,
      )) !== null;
    const write = this.cycleWrite(resolved, today, requested, hasCurrentBudget);
    await this.householdCycles.updateHousehold(householdId, write);
    return this.get(householdId, now);
  }

  /** Soft-delete the current-period cap while leaving all ledger transactions intact. */
  async deleteCurrent(
    actor: BudgetActor,
    householdId: string,
    scope: BudgetScope = "SHARED",
    now: Date = new Date(),
  ): Promise<MonthlyBudgetDTO> {
    if (scope !== "PERSONAL" && actor.role !== "OWNER") {
      throw forbidden("ACCESS_DENIED", OWNER_DENIED);
    }
    const today = jakartaDateOnly(now);
    if (scope === "PERSONAL") {
      const resolved = resolveCycle(
        await this.personalCycles.findByUser(actor.householdId, actor.userId),
        today,
      );
      const period = this.periods.periodForDateOnly(today, resolved.active);
      const deleted = await this.personalBudgets.softDeleteByPeriod(
        actor.householdId,
        actor.userId,
        period.budgetPeriodStart,
        actor.userId,
      );
      if (!deleted) throw notFound("Budget periode ini tidak ditemukan.");
      return this.getPersonal({ userId: actor.userId, householdId: actor.householdId }, now);
    }
    const resolved = resolveCycle(await this.householdCycles.findHousehold(householdId), today);
    const period = this.periods.periodForDateOnly(today, resolved.active);
    const deleted = await this.budgets.softDeleteByPeriod(householdId, period.budgetPeriodStart, actor.userId);
    if (!deleted) throw notFound("Budget periode ini tidak ditemukan.");
    return this.get(householdId, now);
  }

  /** Restore a just-removed current-period budget for the undo toast. */
  async restoreCurrent(
    actor: BudgetActor,
    householdId: string,
    scope: BudgetScope = "SHARED",
    now: Date = new Date(),
  ): Promise<MonthlyBudgetDTO> {
    if (scope !== "PERSONAL" && actor.role !== "OWNER") {
      throw forbidden("ACCESS_DENIED", OWNER_DENIED);
    }
    const today = jakartaDateOnly(now);
    if (scope === "PERSONAL") {
      const resolved = resolveCycle(
        await this.personalCycles.findByUser(actor.householdId, actor.userId),
        today,
      );
      const period = this.periods.periodForDateOnly(today, resolved.active);
      const restored = await this.personalBudgets.restoreByPeriod(
        actor.householdId,
        actor.userId,
        period.budgetPeriodStart,
      );
      if (!restored) throw notFound("Budget yang dihapus tidak ditemukan.");
      return this.getPersonal({ userId: actor.userId, householdId: actor.householdId }, now);
    }
    const resolved = resolveCycle(await this.householdCycles.findHousehold(householdId), today);
    const period = this.periods.periodForDateOnly(today, resolved.active);
    const restored = await this.budgets.restoreByPeriod(householdId, period.budgetPeriodStart);
    if (!restored) throw notFound("Budget yang dihapus tidak ditemukan.");
    return this.get(householdId, now);
  }

  /**
   * Builds the persisted row. When the current period already has a budget,
   * the requested cycle waits for the start of the following period so the
   * visible period and its numbers stay put. When it has none, there is no
   * amount to protect, so the requested cycle applies to the current period
   * immediately. Choosing the active cycle again simply clears a pending change.
   */
  private cycleWrite(
    resolved: ResolvedCycle,
    today: string,
    requested: BudgetCycle,
    hasCurrentBudget: boolean,
  ): BudgetCycleWrite {
    const active = resolved.active;

    if (!hasCurrentBudget) {
      return {
        mode: requested.mode,
        day: requested.day,
        pendingMode: null,
        pendingDay: null,
        pendingEffectiveFrom: null,
      };
    }

    if (sameCycle(active, requested)) {
      return {
        mode: active.mode,
        day: active.day,
        pendingMode: null,
        pendingDay: null,
        pendingEffectiveFrom: null,
      };
    }

    /* First boundary of the new cycle after today, e.g. the next 10th. */
    const effectiveFrom = new Date(
      `${this.periods.nextStartFor(today, requested)}T00:00:00.000Z`,
    );

    return {
      mode: active.mode,
      day: active.day,
      pendingMode: requested.mode,
      pendingDay: requested.day,
      pendingEffectiveFrom: effectiveFrom,
    };
  }
}
