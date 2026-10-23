import { describe, expect, it } from "vitest";
import {
  advisorInsightRequestSchema,
  advisorInsightOutputSchema,
  advisorErrorCodeSchema,
  ADVISOR_ERROR_CODES,
} from "./advisor";

describe("advisorInsightRequestSchema", () => {
  it("accepts a valid period within 90 days", () => {
    const result = advisorInsightRequestSchema.parse({
      period: { start: "2026-09-01", end: "2026-09-30" },
    });
    expect(result.period.start).toBe("2026-09-01");
  });

  it("rejects a period where start > end", () => {
    const result = advisorInsightRequestSchema.safeParse({
      period: { start: "2026-09-30", end: "2026-09-01" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Rentang tanggal tidak valid.");
    }
  });

  it("rejects a span longer than 90 days", () => {
    const result = advisorInsightRequestSchema.safeParse({
      period: { start: "2026-01-01", end: "2026-04-15" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 90 days", () => {
    const result = advisorInsightRequestSchema.parse({
      period: { start: "2026-01-01", end: "2026-03-31" },
    });
    expect(result.period.end).toBe("2026-03-31");
  });

  it("rejects malformed dates", () => {
    expect(
      advisorInsightRequestSchema.safeParse({ period: { start: "2026/09/01", end: "2026-09-30" } })
        .success,
    ).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(
      advisorInsightRequestSchema.safeParse({ period: { start: "2026-02-30", end: "2026-03-01" } })
        .success,
    ).toBe(false);
  });
});

describe("advisorInsightOutputSchema", () => {
  const validOutput = {
    headline: "Pengeluaran makan bulan ini naik",
    summary: "Pengeluaran kategori makan naik 12% dibanding bulan lalu.",
    actions: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
    limitations: "Analisis hanya berdasarkan data transaksi tercatat.",
    sourcePeriod: { start: "2026-09-01", end: "2026-09-30" },
  };

  it("accepts a valid structured output", () => {
    expect(advisorInsightOutputSchema.parse(validOutput).actions).toHaveLength(1);
  });

  it("rejects a headline longer than 120 chars", () => {
    const result = advisorInsightOutputSchema.safeParse({
      ...validOutput,
      headline: "a".repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown action type", () => {
    const result = advisorInsightOutputSchema.safeParse({
      ...validOutput,
      actions: [{ label: "Lihat", type: "BUY_STOCKS" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("advisor error namespace (ADR-003)", () => {
  it("exposes exactly the three canonical codes", () => {
    expect(Array.from(ADVISOR_ERROR_CODES)).toEqual([
      "ADVISOR_RATE_LIMITED",
      "ADVISOR_UNAVAILABLE",
      "ADVISOR_INVALID_OUTPUT",
    ]);
    for (const code of ADVISOR_ERROR_CODES) {
      expect(advisorErrorCodeSchema.parse(code)).toBe(code);
    }
  });
});