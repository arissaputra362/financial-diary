import { describe, expect, it } from "vitest";
import { PeriodService } from "./period";

const periods = new PeriodService();

describe("PeriodService.currentMonth (A-13/D-7, AC-F2-2)", () => {
  it("uses the Jakarta calendar when UTC is still in the previous month", () => {
    /* 2026-09-30T17:30:00Z === 1 Oct 2026 00:30 WIB. */
    const period = periods.currentMonth(new Date("2026-09-30T17:30:00Z"));
    expect(period.periodStartDateOnly).toBe("2026-10-01");
    expect(period.periodEndDateOnly).toBe("2026-10-31");
    expect(period.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-31T16:59:59.999Z");
    expect(period.budgetPeriodStart.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("returns the correct last day for a 30-day month and a leap February", () => {
    expect(periods.currentMonth(new Date("2026-11-15T05:00:00Z")).periodEndDateOnly).toBe("2026-11-30");
    expect(periods.currentMonth(new Date("2028-02-10T05:00:00Z")).periodEndDateOnly).toBe("2028-02-29");
  });
});

describe("PeriodService budget cycles (AC-F2-2d)", () => {
  it("keeps the calendar month shape as the default", () => {
    const period = periods.periodFor(new Date("2026-10-15T05:00:00Z"));
    expect(period.periodStartDateOnly).toBe("2026-10-01");
    expect(period.periodEndDateOnly).toBe("2026-10-31");
  });

  it("runs a fixed day from that date to the day before it next month", () => {
    const cycle = { mode: "FIXED_DAY" as const, day: 10 };
    expect(periods.periodFor(new Date("2026-10-10T05:00:00Z"), cycle)).toMatchObject({
      periodStartDateOnly: "2026-10-10",
      periodEndDateOnly: "2026-11-09",
    });
    expect(periods.periodFor(new Date("2026-10-09T05:00:00Z"), cycle)).toMatchObject({
      periodStartDateOnly: "2026-09-10",
      periodEndDateOnly: "2026-10-09",
    });
    expect(periods.periodFor(new Date("2026-01-31T05:00:00Z"), cycle)).toMatchObject({
      periodStartDateOnly: "2026-01-10",
      periodEndDateOnly: "2026-02-09",
    });
  });

  it("runs end-of-month through the day before next month's last day", () => {
    const cycle = { mode: "END_OF_MONTH" as const, day: null };
    expect(periods.periodFor(new Date("2026-10-31T05:00:00Z"), cycle)).toMatchObject({
      periodStartDateOnly: "2026-10-31",
      periodEndDateOnly: "2026-11-29",
    });
    expect(periods.periodFor(new Date("2026-11-15T05:00:00Z"), cycle)).toMatchObject({
      periodStartDateOnly: "2026-10-31",
      periodEndDateOnly: "2026-11-29",
    });
    expect(periods.periodFor(new Date("2026-11-30T05:00:00Z"), cycle)).toMatchObject({
      periodStartDateOnly: "2026-11-30",
      periodEndDateOnly: "2026-12-30",
    });
    expect(periods.periodFor(new Date("2028-02-29T05:00:00Z"), cycle)).toMatchObject({
      periodStartDateOnly: "2028-02-29",
      periodEndDateOnly: "2028-03-30",
    });
  });

  it("returns the next boundary of the requested cycle after today", () => {
    expect(periods.nextStartFor("2026-10-15", { mode: "FIXED_DAY", day: 10 })).toBe("2026-11-10");
    expect(periods.nextStartFor("2026-10-01", { mode: "FIXED_DAY", day: 10 })).toBe("2026-10-10");
    expect(periods.nextStartFor("2026-10-15", { mode: "CALENDAR_MONTH", day: null })).toBe("2026-11-01");
    expect(periods.nextStartFor("2026-10-15", { mode: "END_OF_MONTH", day: null })).toBe("2026-10-31");
    expect(periods.nextStartFor("2026-10-31", { mode: "END_OF_MONTH", day: null })).toBe("2026-11-30");
  });

  it("rejects a fixed day outside 1 to 28", () => {
    expect(() =>
      periods.periodFor(new Date("2026-10-15T05:00:00Z"), { mode: "FIXED_DAY", day: 29 }),
    ).toThrow(RangeError);
  });
});

describe("PeriodService.lastNDays (AC-F2-5)", () => {
  it("returns n ascending buckets ending on the Jakarta today", () => {
    /* 2026-10-06T20:00:00Z === 7 Oct 2026 03:00 WIB. */
    const period = periods.lastNDays(new Date("2026-10-06T20:00:00Z"), 7);
    expect(period.buckets).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    expect(period.periodStartDateOnly).toBe("2026-10-01");
    expect(period.periodEndDateOnly).toBe("2026-10-07");
    expect(period.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-07T16:59:59.999Z");
  });

  it("crosses the month boundary and supports 30/90 day windows", () => {
    const period = periods.lastNDays(new Date("2026-11-02T05:00:00Z"), 30);
    expect(period.buckets).toHaveLength(30);
    expect(period.buckets[0]).toBe("2026-10-04");
    expect(period.buckets[29]).toBe("2026-11-02");
    expect(periods.lastNDays(new Date("2026-10-10T05:00:00Z"), 90).buckets).toHaveLength(90);
  });

  it("rejects a non-positive day count", () => {
    expect(() => periods.lastNDays(new Date(), 0)).toThrow(RangeError);
  });
});
