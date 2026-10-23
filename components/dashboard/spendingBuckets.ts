/*
  Chart display buckets (T-014; design 02 §5 Card 8, design 01 §5.4).

  The server contract already returns one `SpendingDayDTO` per Asia/Jakarta
  calendar day, oldest to newest, with zero-filled days. `7D` and `30D` render
  those days as-is. `90D` groups the same daily values into Monday-aligned
  weekly buckets on the client: a display grouping only, never a new finance
  calculation. Every input day lands in exactly one bucket, so the bucket sum
  is the same integer as `DashboardSpendingDTO.totalOutMinor`.

  Date arithmetic uses UTC midnight for date-only strings. Jakarta has no DST
  and the weekday of a date-only string is timezone-independent, so the result
  does not depend on the process or device timezone.
*/

import type { DashboardPeriodKey, SpendingDayDTO } from "@/types/api";

export type SpendingBucketKind = "daily" | "weekly";

export interface SpendingBucket {
  /**
   * Monday-aligned key for a weekly bucket; identical to `startDate` for a
   * daily bucket. Used as the stable React key and for grouping.
   */
  weekStart: string;
  /** First day actually covered by this bucket (Jakarta calendar). */
  startDate: string;
  /** Last day actually covered by this bucket (Jakarta calendar). */
  endDate: string;
  /** Sum of the covered days' `amountMinor`; exact integer rupiah. */
  amountMinor: number;
  kind: SpendingBucketKind;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse `YYYY-MM-DD` as UTC midnight, rejecting impossible calendar dates. */
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Monday 00:00 UTC of the week containing `date` (Sunday maps to -6 days). */
function mondayOf(date: Date): Date {
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

/** `7D` / `30D`: one bucket per server day, preserving the server order. */
export function dailyBuckets(days: SpendingDayDTO[]): SpendingBucket[] {
  return days.map((day) => ({
    weekStart: day.date,
    startDate: day.date,
    endDate: day.date,
    amountMinor: day.amountMinor,
    kind: "daily",
  }));
}

/**
 * `90D`: date-aligned Monday-start weekly buckets. The first and last buckets
 * may be partial weeks and keep their real covered start/end. Malformed dates
 * fall back to daily buckets rather than throwing in render.
 */
export function weeklyBuckets(days: SpendingDayDTO[]): SpendingBucket[] {
  if (days.length === 0) return [];

  const parsed: Array<{ date: Date; key: string; amountMinor: number }> = [];
  for (const day of days) {
    const date = parseDateOnly(day.date);
    if (!date) return dailyBuckets(days);
    parsed.push({ date, key: day.date, amountMinor: day.amountMinor });
  }
  parsed.sort((left, right) => left.date.getTime() - right.date.getTime());

  const buckets: SpendingBucket[] = [];
  for (const day of parsed) {
    const weekStart = dateKey(mondayOf(day.date));
    const current = buckets[buckets.length - 1];
    if (!current || current.weekStart !== weekStart) {
      buckets.push({
        weekStart,
        startDate: day.key,
        endDate: day.key,
        amountMinor: day.amountMinor,
        kind: "weekly",
      });
    } else {
      current.endDate = day.key;
      current.amountMinor += day.amountMinor;
    }
  }
  return buckets;
}

/** Select the display grouping for the active period tab. */
export function bucketsForPeriod(
  days: SpendingDayDTO[],
  period: DashboardPeriodKey,
): SpendingBucket[] {
  return period === "90D" ? weeklyBuckets(days) : dailyBuckets(days);
}
