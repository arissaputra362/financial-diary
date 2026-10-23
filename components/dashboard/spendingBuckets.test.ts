import { describe, expect, it } from "vitest";
import type { SpendingDayDTO } from "@/types/api";
import { bucketsForPeriod, dailyBuckets, weeklyBuckets } from "./spendingBuckets";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Build a contiguous `byDay` series exactly like the server contract does. */
function makeDays(
  startDate: string,
  count: number,
  amountFor: (index: number) => number = () => 0,
): SpendingDayDTO[] {
  const [year, month, day] = startDate.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(start + index * MS_PER_DAY).toISOString().slice(0, 10),
    amountMinor: amountFor(index),
  }));
}

function total(days: SpendingDayDTO[]): number {
  return days.reduce((sum, day) => sum + day.amountMinor, 0);
}

describe("dailyBuckets", () => {
  it("keeps 7 daily buckets in server order with their exact values", () => {
    const days = makeDays("2026-10-17", 7, (index) => (index + 1) * 1_000);

    const buckets = dailyBuckets(days);

    expect(buckets).toHaveLength(7);
    expect(buckets.map((bucket) => bucket.kind)).toEqual(Array(7).fill("daily"));
    expect(buckets[0]).toMatchObject({
      weekStart: "2026-10-17",
      startDate: "2026-10-17",
      endDate: "2026-10-17",
      amountMinor: 1_000,
    });
    expect(buckets.at(-1)).toMatchObject({ startDate: "2026-10-23", amountMinor: 7_000 });
  });

  it("keeps 30 daily buckets and zero-filled days", () => {
    const days = makeDays("2026-09-24", 30, (index) => (index === 3 ? 75_000 : 0));

    const buckets = bucketsForPeriod(days, "30D");

    expect(buckets).toHaveLength(30);
    expect(buckets[3]?.amountMinor).toBe(75_000);
    expect(buckets[4]?.amountMinor).toBe(0);
    expect(buckets.reduce((sum, bucket) => sum + bucket.amountMinor, 0)).toBe(75_000);
  });
});

describe("weeklyBuckets", () => {
  it("aligns Monday-start weeks and keeps partial first and last buckets", () => {
    /* Wed 30 Sep 2026 through Tue 6 Oct 2026. */
    const days = makeDays("2026-09-30", 7, (index) => (index + 1) * 10_000);

    const buckets = weeklyBuckets(days);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual({
      weekStart: "2026-09-28",
      startDate: "2026-09-30",
      endDate: "2026-10-04",
      amountMinor: 10_000 + 20_000 + 30_000 + 40_000 + 50_000,
      kind: "weekly",
    });
    expect(buckets[1]).toEqual({
      weekStart: "2026-10-05",
      startDate: "2026-10-05",
      endDate: "2026-10-06",
      amountMinor: 60_000 + 70_000,
      kind: "weekly",
    });
  });

  it("keeps Monday alignment across a month and year boundary", () => {
    /* Mon 29 Dec 2025 through Mon 5 Jan 2026. */
    const days = makeDays("2025-12-29", 8, () => 1_000);

    const buckets = weeklyBuckets(days);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({
      weekStart: "2025-12-29",
      startDate: "2025-12-29",
      endDate: "2026-01-04",
      amountMinor: 7_000,
    });
    expect(buckets[1]).toMatchObject({
      weekStart: "2026-01-05",
      startDate: "2026-01-05",
      endDate: "2026-01-05",
      amountMinor: 1_000,
    });
  });

  it("puts Sunday in the previous Monday-start week", () => {
    const days = makeDays("2026-10-25", 2, () => 500);

    const buckets = weeklyBuckets(days);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({
      weekStart: "2026-10-19",
      startDate: "2026-10-25",
      endDate: "2026-10-25",
    });
    expect(buckets[1]).toMatchObject({
      weekStart: "2026-10-26",
      startDate: "2026-10-26",
      endDate: "2026-10-26",
    });
  });

  it("is DST-free: a US DST week stays one Monday-start bucket", () => {
    /* Mon 2 Mar 2026 through Mon 9 Mar 2026 (US DST starts 8 Mar 2026). */
    const days = makeDays("2026-03-02", 8, () => 2_000);

    const buckets = weeklyBuckets(days);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({
      weekStart: "2026-03-02",
      endDate: "2026-03-08",
      amountMinor: 14_000,
    });
    expect(buckets[1]).toMatchObject({ weekStart: "2026-03-09", endDate: "2026-03-09" });
  });

  it("sums to totalOutMinor for a 90-day window with partial edge weeks", () => {
    /* Sun 26 Jul 2026 through Fri 23 Oct 2026 = 90 Jakarta calendar days. */
    const days = makeDays("2026-07-26", 90, (index) => (index + 1) * 1_000);
    const totalOutMinor = total(days);

    const buckets = weeklyBuckets(days);

    expect(buckets).toHaveLength(14);
    expect(buckets[0]).toMatchObject({
      weekStart: "2026-07-20",
      startDate: "2026-07-26",
      endDate: "2026-07-26",
      amountMinor: 1_000,
    });
    expect(buckets.at(-1)).toMatchObject({
      weekStart: "2026-10-19",
      startDate: "2026-10-19",
      endDate: "2026-10-23",
      amountMinor: 86_000 + 87_000 + 88_000 + 89_000 + 90_000,
    });
    expect(buckets.reduce((sum, bucket) => sum + bucket.amountMinor, 0)).toBe(totalOutMinor);

    const coveredDays = buckets.reduce(
      (sum, bucket) => sum + Math.round(
        (Date.parse(`${bucket.endDate}T00:00:00Z`) -
          Date.parse(`${bucket.startDate}T00:00:00Z`)) /
          MS_PER_DAY,
      ) + 1,
      0,
    );
    expect(coveredDays).toBe(90);
  });

  it("produces 13 buckets when a 90-day window starts on Monday", () => {
    const days = makeDays("2026-07-27", 90, () => 1_000);

    const buckets = weeklyBuckets(days);

    expect(buckets).toHaveLength(13);
    expect(buckets[0]).toMatchObject({ weekStart: "2026-07-27", startDate: "2026-07-27" });
    expect(buckets.at(-1)).toMatchObject({ startDate: "2026-10-19", endDate: "2026-10-24" });
  });

  it("falls back to daily buckets for malformed dates without losing money", () => {
    const days: SpendingDayDTO[] = [
      { date: "2026-10-23", amountMinor: 10_000 },
      { date: "not-a-date", amountMinor: 5_000 },
    ];

    expect(weeklyBuckets(days)).toEqual(dailyBuckets(days));
    expect(weeklyBuckets(days).reduce((sum, bucket) => sum + bucket.amountMinor, 0)).toBe(15_000);
  });

  it("returns no buckets for an empty period", () => {
    expect(weeklyBuckets([])).toEqual([]);
    expect(bucketsForPeriod([], "90D")).toEqual([]);
  });
});
