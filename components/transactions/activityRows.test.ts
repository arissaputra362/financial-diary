import { describe, expect, it } from "vitest";
import type { TransactionDTO } from "@/types/api";
import { filterActivityRows, mergeActivityRows, shouldOfferLoadMore } from "./activityRows";

/*
  BUG-QA-F7-04: a client-side filter can find no match on page 1 while the
  first match sits on page 2. The page must offer the existing load-more action
  instead of claiming the filter has no transactions.
*/
function row(
  overrides: Pick<TransactionDTO, "id" | "type"> & Partial<TransactionDTO>,
): TransactionDTO {
  return {
    amountMinor: 10_000,
    currencyCode: "IDR",
    category: null,
    merchant: null,
    note: null,
    occurredAt: "2026-10-05T03:00:00.000Z",
    source: "MANUAL",
    receiptId: null,
    transferGroupId: null,
    wallet: null,
    deletedAt: null,
    createdAt: "2026-10-05T03:00:00.000Z",
    ...overrides,
  };
}

describe("activityRows", () => {
  it("finds the first match on page 2 and keeps loading available meanwhile", () => {
    const pageOne = [
      row({ id: "expense-1", type: "MONEY_OUT" }),
      row({ id: "income-1", type: "MONEY_IN" }),
    ];
    expect(filterActivityRows(pageOne, "transfer")).toHaveLength(0);
    expect(shouldOfferLoadMore(0, "page-2")).toBe(true);

    const pageTwo = [
      row({
        id: "transfer-out",
        type: "MONEY_OUT",
        transferGroupId: "group-1",
      }),
    ];
    const merged = mergeActivityRows(pageOne, pageTwo);
    expect(filterActivityRows(merged, "transfer")).toHaveLength(1);
    expect(shouldOfferLoadMore(1, null)).toBe(false);
  });

  it("keeps server-filtered type rows as delivered and de-duplicates pages", () => {
    const pageOne = [row({ id: "expense-1", type: "MONEY_OUT" })];
    const pageTwo = [
      row({ id: "expense-2", type: "MONEY_OUT" }),
      row({ id: "expense-1", type: "MONEY_OUT" }),
    ];
    const merged = mergeActivityRows(pageOne, pageTwo);
    expect(merged.map((entry) => entry.id)).toEqual(["expense-1", "expense-2"]);
    expect(filterActivityRows(merged, "out")).toHaveLength(2);
  });

  it("keeps transfer legs out of Uang masuk/Uang keluar and in the Transfer filter", () => {
    const rows = [
      row({ id: "expense-1", type: "MONEY_OUT" }),
      row({ id: "transfer-out", type: "MONEY_OUT", transferGroupId: "group-1" }),
    ];
    expect(filterActivityRows(rows, "out").map((entry) => entry.id)).toEqual(["expense-1"]);
    expect(filterActivityRows(rows, "transfer").map((entry) => entry.id)).toEqual([
      "transfer-out",
    ]);
  });

  it("does not offer load-more when the filtered set is empty and the cursor is done", () => {
    expect(shouldOfferLoadMore(0, null)).toBe(false);
    expect(shouldOfferLoadMore(0, "page-2")).toBe(true);
  });
});
