/*
  PeriodService (A-13 / D-7, feat-dashboard AC-F2-2, AC-F2-5, AC-F2-2d).

  Every period boundary is derived from the Asia/Jakarta calendar, never from the
  server process clock (UTC) and never from the device timezone. Jakarta has no
  DST, so a fixed +07:00 offset is exact for every date in scope.

  Budget cycles (AC-F2-2d):
  - CALENDAR_MONTH: day 1 through the last day of the same month (default).
  - FIXED_DAY: the chosen day (1-28) through the day before it next month.
  - END_OF_MONTH: the last day of a month through the day before the last day
    of the following month.

  Two shapes are returned per period:
  - `start` / `end` are the inclusive UTC instants used to filter `occurred_at`.
  - `budgetPeriodStart` is a UTC-midnight Date used as the `@db.Date` key for
    `household_budget.period_start` / `personal_budget.period_start`.
*/

import { endOfJakartaDay, jakartaDateOnly, startOfJakartaDay } from "../jakarta";

const MONTH_PERIOD_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateOnly(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Days in a Gregorian month (month is 1-12). */
function daysInMonth(year: number, month: number): number {
  if (month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) return 29;
  return MONTH_PERIOD_DAYS[month - 1] ?? 30;
}

/** UTC-midnight Date for a `YYYY-MM-DD` string (the `@db.Date` representation). */
function utcMidnight(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` for a UTC-midnight `@db.Date` value. */
export function dateOnlyFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Shift a date-only string by a whole number of days. */
export function addDaysToDateOnly(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Shift a `(year, month)` pair, keeping the day at 1 for overflow safety. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function lastDayOfMonth(year: number, month: number): string {
  return dateOnly(year, month, daysInMonth(year, month));
}

export type BudgetCycleMode = "CALENDAR_MONTH" | "FIXED_DAY" | "END_OF_MONTH";

export interface BudgetCycle {
  mode: BudgetCycleMode;
  /** Required for FIXED_DAY (1-28); null for the other modes. */
  day: number | null;
}

/** Default keeps the existing calendar-month behaviour (AC-F2-2d). */
export const DEFAULT_BUDGET_CYCLE: BudgetCycle = { mode: "CALENDAR_MONTH", day: null };

/** Maximum anchor day, so every month has the same day (AC-F2-2d). */
export const MAX_FIXED_DAY = 28;

export interface MonthPeriod {
  periodStartDateOnly: string;
  periodEndDateOnly: string;
  /** Inclusive 00:00 WIB on the first day, as a UTC instant. */
  start: Date;
  /** Inclusive 23:59:59.999 WIB on the last day, as a UTC instant. */
  end: Date;
  /** Key for `household_budget.period_start` / `personal_budget.period_start`. */
  budgetPeriodStart: Date;
}

export interface DayPeriod {
  periodStartDateOnly: string;
  periodEndDateOnly: string;
  start: Date;
  end: Date;
  /** `n` date-only buckets in ascending order, ending on the Jakarta today. */
  buckets: string[];
}

function buildMonthPeriod(startDateOnly: string, endDateOnly: string): MonthPeriod {
  return {
    periodStartDateOnly: startDateOnly,
    periodEndDateOnly: endDateOnly,
    start: startOfJakartaDay(startDateOnly),
    end: endOfJakartaDay(endDateOnly),
    budgetPeriodStart: utcMidnight(startDateOnly),
  };
}

export class PeriodService {
  /**
   * The budget period that contains `now` for one cycle. Calendar month is the
   * default so existing callers keep their exact behaviour.
   */
  periodFor(now: Date, cycle: BudgetCycle = DEFAULT_BUDGET_CYCLE): MonthPeriod {
    return this.periodForDateOnly(jakartaDateOnly(now), cycle);
  }

  /** Same as `periodFor`, but with an explicit Asia/Jakarta date-only value. */
  periodForDateOnly(today: string, cycle: BudgetCycle = DEFAULT_BUDGET_CYCLE): MonthPeriod {
    const [yearValue, monthValue, dayValue] = today.split("-").map(Number);
    const year = yearValue ?? 1970;
    const month = monthValue ?? 1;
    const day = dayValue ?? 1;

    if (cycle.mode === "FIXED_DAY") {
      const anchor = cycle.day;
      if (anchor === null || !Number.isInteger(anchor) || anchor < 1 || anchor > MAX_FIXED_DAY) {
        throw new RangeError(`FIXED_DAY requires a day between 1 and ${MAX_FIXED_DAY}.`);
      }
      if (day >= anchor) {
        const next = shiftMonth(year, month, 1);
        return buildMonthPeriod(
          dateOnly(year, month, anchor),
          addDaysToDateOnly(dateOnly(next.year, next.month, anchor), -1),
        );
      }
      const previous = shiftMonth(year, month, -1);
      return buildMonthPeriod(
        dateOnly(previous.year, previous.month, anchor),
        addDaysToDateOnly(dateOnly(year, month, anchor), -1),
      );
    }

    if (cycle.mode === "END_OF_MONTH") {
      const start =
        day === daysInMonth(year, month)
          ? dateOnly(year, month, day)
          : (() => {
              const previous = shiftMonth(year, month, -1);
              return lastDayOfMonth(previous.year, previous.month);
            })();
      const [startYear, startMonth] = start.split("-").map(Number);
      const next = shiftMonth(startYear ?? year, startMonth ?? month, 1);
      return buildMonthPeriod(start, addDaysToDateOnly(lastDayOfMonth(next.year, next.month), -1));
    }

    return buildMonthPeriod(dateOnly(year, month, 1), lastDayOfMonth(year, month));
  }

  /** Start of the period after `period`. */
  nextPeriodStart(period: MonthPeriod): string {
    return addDaysToDateOnly(period.periodEndDateOnly, 1);
  }

  /**
   * First boundary of `cycle` strictly after `today`. Used as the effective
   * date of a cycle change, so a fixed-day cycle starts on its next anchor
   * (for example the 10th) instead of reopening a period that has already run.
   */
  nextStartFor(today: string, cycle: BudgetCycle = DEFAULT_BUDGET_CYCLE): string {
    const period = this.periodForDateOnly(today, cycle);
    if (period.periodStartDateOnly > today) return period.periodStartDateOnly;
    return addDaysToDateOnly(period.periodEndDateOnly, 1);
  }

  /** The Asia/Jakarta calendar month that contains `now`. */
  currentMonth(now: Date = new Date()): MonthPeriod {
    return this.periodFor(now, DEFAULT_BUDGET_CYCLE);
  }

  /** A specific `YYYY-MM` Asia/Jakarta calendar month. */
  month(key: string): MonthPeriod {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
    if (!match) throw new RangeError("Month key must be YYYY-MM.");
    const year = Number(match[1]);
    const month = Number(match[2]);
    return buildMonthPeriod(dateOnly(year, month, 1), lastDayOfMonth(year, month));
  }

  /** The last `n` Asia/Jakarta calendar days, inclusive of today (n buckets). */
  lastNDays(now: Date, n: number): DayPeriod {
    if (!Number.isInteger(n) || n < 1) {
      throw new RangeError("LastNDays requires a positive integer day count.");
    }
    const [year, month, day] = jakartaDateOnly(now).split("-").map(Number);
    const todayUtc = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
    const buckets: string[] = [];
    for (let offset = n - 1; offset >= 0; offset -= 1) {
      const cursor = new Date(todayUtc - offset * 24 * 60 * 60 * 1000);
      buckets.push(
        dateOnly(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()),
      );
    }
    const first = buckets[0] ?? dateOnly(year ?? 1970, month ?? 1, day ?? 1);
    const last = buckets[buckets.length - 1] ?? first;
    return {
      periodStartDateOnly: first,
      periodEndDateOnly: last,
      start: startOfJakartaDay(first),
      end: endOfJakartaDay(last),
      buckets,
    };
  }
}
