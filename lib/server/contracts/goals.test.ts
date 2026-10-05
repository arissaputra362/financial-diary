import { describe, expect, it } from "vitest";
import { createGoalSchema, adjustSavedSchema, goalTrashListQuerySchema } from "./goals";

describe("createGoalSchema", () => {
  it("accepts a valid goal", () => {
    const result = createGoalSchema.parse({
      name: "Dana darurat",
      targetAmountMinor: 5_000_000,
      deadline: "2026-12-31",
    });
    expect(result.targetAmountMinor).toBe(5_000_000);
  });

  it("rejects targetAmountMinor 0 with an explicit message", () => {
    const result = createGoalSchema.safeParse({ name: "Dana darurat", targetAmountMinor: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Target harus lebih dari 0.");
    }
  });

  it("rejects an empty name and a name longer than 80 (A-20)", () => {
    expect(createGoalSchema.safeParse({ name: "   ", targetAmountMinor: 1000 }).success).toBe(false);
    expect(createGoalSchema.safeParse({ name: "a".repeat(81), targetAmountMinor: 1000 }).success).toBe(false);
  });

  it("rejects a malformed deadline", () => {
    const result = createGoalSchema.safeParse({
      name: "Dana darurat",
      targetAmountMinor: 1000,
      deadline: "31-12-2026",
    });
    expect(result.success).toBe(false);
  });
});

describe("adjustSavedSchema", () => {
  it("accepts a non-zero delta", () => {
    expect(adjustSavedSchema.parse({ savedDelta: 50_000 }).savedDelta).toBe(50_000);
    expect(adjustSavedSchema.parse({ savedDelta: -25_000 }).savedDelta).toBe(-25_000);
  });

  it("rejects savedDelta 0 (A-16)", () => {
    const result = adjustSavedSchema.safeParse({ savedDelta: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Jumlah perubahan tidak valid.");
    }
  });

  it("rejects a non-integer delta", () => {
    expect(adjustSavedSchema.safeParse({ savedDelta: 1.5 }).success).toBe(false);
  });
});

describe("goalTrashListQuerySchema", () => {
  it("applies the default limit and rejects above 50 (A-14)", () => {
    expect(goalTrashListQuerySchema.parse({}).limit).toBe(20);
    expect(goalTrashListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
  });
});