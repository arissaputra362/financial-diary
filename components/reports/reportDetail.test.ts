import { describe, expect, it } from "vitest";
import type { TransactionDTO, TransactionListDTO } from "@/types/api";
import {
  buildReportDetailSections,
  canOfferPrint,
  collectReportDetailRows,
  formatReportDetailDate,
  groupReportDetailRows,
  reportDetailDescription,
} from "./reportDetail";

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
    wallet: { id: "wallet-shared", name: "Dompet Bersama", scope: "SHARING" },
    deletedAt: null,
    createdAt: "2026-10-05T03:00:00.000Z",
    ...overrides,
  };
}

const personalWallet = {
  id: "wallet-personal",
  name: "Dompet Pribadi",
  scope: "PERSONAL" as const,
};

describe("groupReportDetailRows", () => {
  it("filters the active scope, groups by type, and sorts by date then id descending", () => {
    const rows = [
      row({ id: "income-a", type: "MONEY_IN", occurredAt: "2026-10-05T03:00:00.000Z" }),
      row({ id: "income-b", type: "MONEY_IN", occurredAt: "2026-10-05T03:00:00.000Z" }),
      row({ id: "income-old", type: "MONEY_IN", occurredAt: "2026-10-01T03:00:00.000Z" }),
      row({ id: "expense-a", type: "MONEY_OUT" }),
      row({
        id: "personal-expense",
        type: "MONEY_OUT",
        wallet: personalWallet,
      }),
    ];

    const shared = groupReportDetailRows(rows, "shared");
    expect(shared.income.map((entry) => entry.id)).toEqual([
      "income-b",
      "income-a",
      "income-old",
    ]);
    expect(shared.expense.map((entry) => entry.id)).toEqual(["expense-a"]);
    expect(shared.transfer).toEqual([]);

    const personal = groupReportDetailRows(rows, "personal");
    expect(personal.income).toEqual([]);
    expect(personal.expense.map((entry) => entry.id)).toEqual(["personal-expense"]);
  });

  it("puts transfer legs in Transfer, including redacted cross-scope legs", () => {
    const rows = [
      row({
        id: "transfer-out",
        type: "MONEY_OUT",
        transferGroupId: "group-1",
      }),
      row({
        id: "transfer-in-redacted",
        type: "MONEY_IN",
        wallet: null,
        source: null,
      }),
      row({ id: "income", type: "MONEY_IN" }),
    ];

    const groups = groupReportDetailRows(rows, "shared");
    expect(groups.transfer.map((entry) => entry.id)).toEqual([
      "transfer-out",
      "transfer-in-redacted",
    ]);
    expect(groups.income.map((entry) => entry.id)).toEqual(["income"]);
    expect(reportDetailDescription(groups.transfer[0]!, true)).toBe("Transfer");
  });

  it("returns no detail at all for an empty month", () => {
    expect(groupReportDetailRows([], "shared")).toEqual({
      income: [],
      expense: [],
      transfer: [],
    });
    expect(
      buildReportDetailSections([], "shared", {
        incomeMinor: 0,
        expenseMinor: 0,
        transferInMinor: 0,
        transferOutMinor: 0,
      }),
    ).toEqual([]);
  });
});

describe("buildReportDetailSections", () => {
  it("copies subtotals from the report totals instead of summing rows", () => {
    const sections = buildReportDetailSections(
      [
        row({ id: "income", type: "MONEY_IN", amountMinor: 10_000 }),
        row({
          id: "transfer-in",
          type: "MONEY_IN",
          amountMinor: 20_000,
          transferGroupId: "group-1",
        }),
        row({
          id: "transfer-out",
          type: "MONEY_OUT",
          amountMinor: 20_000,
          transferGroupId: "group-1",
        }),
      ],
      "shared",
      {
        incomeMinor: 999_000,
        expenseMinor: 888_000,
        transferInMinor: 20_000,
        transferOutMinor: 20_000,
      },
    );

    expect(sections.map((section) => section.key)).toEqual(["income", "transfer"]);
    expect(sections[0]?.subtotalMinor).toBe(999_000);
    expect(sections[1]?.subtotalMinor).toBe(40_000);
  });

  it("omits empty sections, such as a month without transfer", () => {
    const sections = buildReportDetailSections(
      [row({ id: "expense", type: "MONEY_OUT" })],
      "shared",
      {
        incomeMinor: 0,
        expenseMinor: 10_000,
        transferInMinor: 0,
        transferOutMinor: 0,
      },
    );
    expect(sections.map((section) => section.title)).toEqual(["Uang keluar"]);
  });
});

describe("collectReportDetailRows", () => {
  it("walks every cursor page and de-duplicates rows that shift between pages", async () => {
    const cursors: Array<string | null> = [];
    const pages: Record<string, TransactionListDTO> = {
      first: {
        rows: [
          row({ id: "row-a", type: "MONEY_IN" }),
          row({ id: "row-b", type: "MONEY_OUT" }),
        ],
        nextCursor: "cursor-2",
      },
      "cursor-2": {
        rows: [
          row({ id: "row-b", type: "MONEY_OUT" }),
          row({ id: "row-c", type: "MONEY_IN" }),
        ],
        nextCursor: null,
      },
    };
    const rows = await collectReportDetailRows(async (cursor) => {
      cursors.push(cursor);
      return pages[cursor ?? "first"]!;
    });

    expect(cursors).toEqual([null, "cursor-2"]);
    expect(rows.map((entry) => entry.id)).toEqual(["row-a", "row-b", "row-c"]);
  });

  it("fails instead of looping forever when a cursor repeats", async () => {
    await expect(
      collectReportDetailRows(async () => ({
        rows: [],
        nextCursor: "same-cursor",
      })),
    ).rejects.toThrow("Cursor transaksi berulang.");
  });
});

describe("canOfferPrint", () => {
  it("renders the button only for a loaded, non-error report with rows", () => {
    expect(canOfferPrint({ loading: true, error: false, transactionCount: 3 })).toBe(false);
    expect(canOfferPrint({ loading: false, error: true, transactionCount: 3 })).toBe(false);
    expect(canOfferPrint({ loading: false, error: false, transactionCount: 0 })).toBe(false);
    expect(canOfferPrint({ loading: false, error: false, transactionCount: null })).toBe(false);
    expect(canOfferPrint({ loading: false, error: false, transactionCount: 1 })).toBe(true);
  });
});

describe("detail row formatting", () => {
  it("formats the date on the Jakarta calendar, including the month boundary", () => {
    expect(formatReportDetailDate("2026-10-31T17:00:00.000Z")).toBe("1 Nov");
    expect(formatReportDetailDate("2026-10-05T03:00:00.000Z")).toBe("5 Okt");
  });

  it("uses merchant, then note, then category for non-transfer rows", () => {
    expect(
      reportDetailDescription(
        row({ id: "one", type: "MONEY_OUT", merchant: "Toko", note: "Catatan" }),
        false,
      ),
    ).toBe("Toko");
    expect(
      reportDetailDescription(
        row({ id: "two", type: "MONEY_OUT", merchant: null, note: "Catatan" }),
        false,
      ),
    ).toBe("Catatan");
    expect(
      reportDetailDescription(
        row({ id: "three", type: "MONEY_OUT", merchant: null, note: null, category: "food" }),
        false,
      ),
    ).toBe("Makanan");
    expect(
      reportDetailDescription(
        row({ id: "four", type: "MONEY_OUT", merchant: null, note: null, category: null }),
        false,
      ),
    ).toBe("Tanpa kategori");
  });
});
