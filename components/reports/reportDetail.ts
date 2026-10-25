/*
  Pure helpers for the printed transaction detail (AC-F7-17). The report DTO
  stays the only source for aggregate numbers; this module only filters list rows
  into the active scope and sorts/groups them for paper. It never sums amounts.
*/

import { categoryLabel } from "@/components/transactions/categories";
import { mergeActivityRows } from "@/components/transactions/activityRows";
import type { TransactionDTO, TransactionListDTO } from "@/types/api";

export type ReportDetailScope = "shared" | "personal";
export type ReportDetailSectionKey = "income" | "expense" | "transfer";

export interface ReportDetailTotals {
  incomeMinor: number;
  expenseMinor: number;
  transferInMinor: number;
  transferOutMinor: number;
}

export interface ReportDetailSection {
  key: ReportDetailSectionKey;
  title: "Uang masuk" | "Uang keluar" | "Transfer";
  rows: TransactionDTO[];
  /** Copied from the report DTO, never summed from `rows`. */
  subtotalMinor: number;
}

export interface ReportDetailGroups {
  income: TransactionDTO[];
  expense: TransactionDTO[];
  transfer: TransactionDTO[];
}

/** A-39 rows null the wallet and source because the other transfer leg is private. */
export function isRedactedTransferLeg(row: TransactionDTO): boolean {
  return row.wallet === null && row.source === null;
}

export function isReportTransferRow(row: TransactionDTO): boolean {
  return (
    row.type === "TRANSFER" ||
    row.transferGroupId !== null ||
    isRedactedTransferLeg(row)
  );
}

/*
  The list endpoint returns every wallet the actor may see (SHARING plus their
  own PERSONAL). The report itself is scoped, so rows from the other scope are
  filtered out here. Redacted cross-scope transfer legs have no wallet; they are
  the visible SHARING leg and belong to the shared report.
*/
function belongsToReportScope(row: TransactionDTO, scope: ReportDetailScope): boolean {
  if (scope === "personal") return row.wallet?.scope === "PERSONAL";
  return row.wallet?.scope === "SHARING" || isRedactedTransferLeg(row);
}

const jakartaDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Jakarta",
});

function jakartaDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return jakartaDateKeyFormatter.format(date);
}

/** Newest Jakarta calendar date first; same-date rows use a stable id tiebreaker. */
function compareDetailRows(left: TransactionDTO, right: TransactionDTO): number {
  const leftDate = jakartaDateKey(left.occurredAt);
  const rightDate = jakartaDateKey(right.occurredAt);
  if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
  return right.id.localeCompare(left.id);
}

export function groupReportDetailRows(
  rows: TransactionDTO[],
  scope: ReportDetailScope,
): ReportDetailGroups {
  const groups: ReportDetailGroups = { income: [], expense: [], transfer: [] };
  for (const row of rows) {
    if (!belongsToReportScope(row, scope)) continue;
    if (isReportTransferRow(row)) groups.transfer.push(row);
    else if (row.type === "MONEY_IN") groups.income.push(row);
    else if (row.type === "MONEY_OUT") groups.expense.push(row);
  }
  groups.income.sort(compareDetailRows);
  groups.expense.sort(compareDetailRows);
  groups.transfer.sort(compareDetailRows);
  return groups;
}

/*
  Empty sections disappear from paper entirely. Subtotals are copied from the
  report DTO; the transfer subtotal is the one addition the design mandates
  (transfer in + transfer out) and both operands are server numbers.
*/
export function buildReportDetailSections(
  rows: TransactionDTO[],
  scope: ReportDetailScope,
  totals: ReportDetailTotals,
): ReportDetailSection[] {
  const groups = groupReportDetailRows(rows, scope);
  const sections: ReportDetailSection[] = [];
  if (groups.income.length > 0) {
    sections.push({
      key: "income",
      title: "Uang masuk",
      rows: groups.income,
      subtotalMinor: totals.incomeMinor,
    });
  }
  if (groups.expense.length > 0) {
    sections.push({
      key: "expense",
      title: "Uang keluar",
      rows: groups.expense,
      subtotalMinor: totals.expenseMinor,
    });
  }
  if (groups.transfer.length > 0) {
    sections.push({
      key: "transfer",
      title: "Transfer",
      rows: groups.transfer,
      subtotalMinor: totals.transferInMinor + totals.transferOutMinor,
    });
  }
  return sections;
}

/*
  Walk the existing keyset list contract until `nextCursor` is null. A repeated
  cursor would otherwise loop forever, so it fails honestly instead. Repeated
  rows across pages are de-duplicated by id (the server can shift a row while a
  print run is in flight).
*/
export async function collectReportDetailRows(
  fetchPage: (cursor: string | null) => Promise<TransactionListDTO>,
): Promise<TransactionDTO[]> {
  let rows: TransactionDTO[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();

  do {
    const page = await fetchPage(cursor);
    rows = mergeActivityRows(rows, page.rows);
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) throw new Error("Cursor transaksi berulang.");
      seenCursors.add(cursor);
    }
  } while (cursor !== null);

  return rows;
}

export function canOfferPrint(input: {
  loading: boolean;
  error: boolean;
  transactionCount: number | null;
}): boolean {
  return (
    !input.loading &&
    !input.error &&
    input.transactionCount !== null &&
    input.transactionCount > 0
  );
}

const detailDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

/** Calendar date on paper (`5 Okt`), always WIB and never relative to today. */
export function formatReportDetailDate(occurredAt: string): string {
  const value = new Date(occurredAt);
  return Number.isNaN(value.getTime()) ? occurredAt : detailDateFormatter.format(value);
}

/** Transfer legs use the fixed section label; other rows use the activity title rule. */
export function reportDetailDescription(row: TransactionDTO, transfer: boolean): string {
  if (transfer) return "Transfer";
  return row.merchant ?? row.note ?? categoryLabel(row.category);
}
