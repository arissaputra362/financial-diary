/*
  PeriodService (A-13 / D-7, feat-dashboard AC-F2-2, AC-F2-5).

  Every period boundary is derived from the Asia/Jakarta calendar, never from the
  server process clock (UTC) and never from the device timezone. Jakarta has no
  DST, so a fixed +07:00 offset is exact for every date in scope.

  Two shapes are returned per period:
  - `start` / `end` are the inclusive UTC instants used to filter `occurred_at`.
  - `budgetPeriodStart` is a UTC-midnight Date used as the `@db.Date` key for
    `household_budget.period_start` (Prisma stores the UTC calendar date).
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

export interface MonthPeriod {
  periodStartDateOnly: string;
  periodEndDateOnly: string;
  /** Inclusive 00:00 WIB on the 1st, as a UTC instant. */
  start: Date;
  /** Inclusive 23:59:59.999 WIB on the last day, as a UTC instant. */
  end: Date;
  /** Key for `household_budget.period_start`. */
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

export class PeriodService {
  /** The Asia/Jakarta calendar month that contains `now`. */
  currentMonth(now: Date = new Date()): MonthPeriod {
    const [year, month] = jakartaDateOnly(now).split("-").map(Number);
    const startDateOnly = dateOnly(year ?? 1970, month ?? 1, 1);
    const endDateOnly = dateOnly(year ?? 1970, month ?? 1, daysInMonth(year ?? 1970, month ?? 1));
    return {
      periodStartDateOnly: startDateOnly,
      periodEndDateOnly: endDateOnly,
      start: startOfJakartaDay(startDateOnly),
      end: endOfJakartaDay(endDateOnly),
      budgetPeriodStart: utcMidnight(startDateOnly),
    };
  }

  /** A specific `YYYY-MM` Asia/Jakarta calendar month. */
  month(key: string): MonthPeriod {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
    if (!match) throw new RangeError("Month key must be YYYY-MM.");
    const year = Number(match[1]);
    const month = Number(match[2]);
    const startDateOnly = dateOnly(year, month, 1);
    const endDateOnly = dateOnly(year, month, daysInMonth(year, month));
    return {
      periodStartDateOnly: startDateOnly,
      periodEndDateOnly: endDateOnly,
      start: startOfJakartaDay(startDateOnly),
      end: endOfJakartaDay(endDateOnly),
      budgetPeriodStart: utcMidnight(startDateOnly),
    };
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
