import { describe, expect, it } from "vitest";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  idSchema,
  trashListQuerySchema,
} from "./transactions";

const validBase = {
  type: "MONEY_OUT",
  amountMinor: 25_000,
  category: "food",
  occurredAt: "2026-10-01",
  walletId: "66666666-6666-4666-8666-666666666666",
};

describe("createTransactionSchema", () => {
  it("accepts a valid manual payload", () => {
    const result = createTransactionSchema.parse(validBase);
    expect(result.source).toBe("MANUAL");
    expect(result.amountMinor).toBe(25_000);
  });

  it("rejects amountMinor 0 / negative / above int32 max with explicit messages", () => {
    for (const amountMinor of [0, -5, 2_147_483_648]) {
      const result = createTransactionSchema.safeParse({ ...validBase, amountMinor });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/Jumlah (harus lebih dari 0|terlalu besar)/);
      }
    }
  });

  it("rejects a MONEY_IN transaction with a non-income category (A-09)", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      type: "MONEY_IN",
      category: "food",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Pilih kategori yang sesuai.");
    }
  });

  it("accepts a MONEY_IN transaction with income category", () => {
    const result = createTransactionSchema.parse({
      ...validBase,
      type: "MONEY_IN",
      category: "income",
    });
    expect(result.category).toBe("income");
  });

  it("rejects a non-integer amount", () => {
    const result = createTransactionSchema.safeParse({ ...validBase, amountMinor: 10.5 });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed occurredAt date", () => {
    const result = createTransactionSchema.safeParse({ ...validBase, occurredAt: "01-10-2026" });
    expect(result.success).toBe(false);
  });

  it("rejects a note longer than 500 and merchant longer than 120 (A-20)", () => {
    expect(createTransactionSchema.safeParse({ ...validBase, note: "a".repeat(501) }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...validBase, merchant: "a".repeat(121) }).success).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = createTransactionSchema.safeParse({ ...validBase, category: "makanan" });
    expect(result.success).toBe(false);
  });
});

describe("listTransactionsQuerySchema", () => {
  it("accepts filters and applies the default limit 20 (A-14)", () => {
    const result = listTransactionsQuerySchema.parse({ type: "MONEY_OUT", limit: "10" });
    expect(result.limit).toBe(10);
    expect(listTransactionsQuerySchema.parse({}).limit).toBe(20);
  });

  it("rejects limit above 50 (A-14)", () => {
    const result = listTransactionsQuerySchema.safeParse({ limit: "51" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Jumlah per halaman maksimal 50.");
    }
  });

  it("rejects a malformed cursor", () => {
    const result = listTransactionsQuerySchema.safeParse({ cursor: "has space" });
    expect(result.success).toBe(false);
  });
});

describe("idSchema", () => {
  it("accepts a uuid", () => {
    expect(idSchema.parse("0b8f6c1e-6f0a-4b8e-9c1d-2a3b4c5d6e7f")).toBe(
      "0b8f6c1e-6f0a-4b8e-9c1d-2a3b4c5d6e7f",
    );
  });

  it("rejects a non-uuid with the generic not-found message", () => {
    const result = idSchema.safeParse("bukan-uuid");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Data tidak ditemukan.");
    }
  });
});

describe("trashListQuerySchema", () => {
  it("applies the default limit and rejects above 50", () => {
    expect(trashListQuerySchema.parse({}).limit).toBe(20);
    expect(trashListQuerySchema.safeParse({ limit: "99" }).success).toBe(false);
  });
});