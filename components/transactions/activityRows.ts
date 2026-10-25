/*
  Row helpers for the activity list. `in`/`out` pages arrive already narrowed by
  the server (`activityListUrl` sends `type`), and transfer legs stay out of
  those two pills so `Transfer` remains a separate filter (design 08, decision
  3). The `transfer` filter is still applied to the loaded page, so a page can
  be empty while a later cursor holds the first match. That is why the
  empty-filter card offers the existing load-more action instead of claiming
  there are no transactions (BUG-QA-F7-04).
*/

import type { TransactionDTO } from "@/types/api";
import type { ActivityTypeFilter } from "./activityUrl";
import { isTransferLeg } from "./categories";

export function filterActivityRows(
  rows: TransactionDTO[],
  filter: ActivityTypeFilter,
): TransactionDTO[] {
  if (filter === "transfer") return rows.filter(isTransferLeg);
  if (filter === "in" || filter === "out") {
    const type = filter === "in" ? "MONEY_IN" : "MONEY_OUT";
    return rows.filter((row) => row.type === type && !isTransferLeg(row));
  }
  return rows;
}

/** Append a cursor page without duplicating a row that moved between pages. */
export function mergeActivityRows(
  current: TransactionDTO[],
  incoming: TransactionDTO[],
): TransactionDTO[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((row) => row.id));
  return [...current, ...incoming.filter((row) => !seen.has(row.id))];
}

export function shouldOfferLoadMore(
  visibleCount: number,
  nextCursor: string | null,
): boolean {
  return visibleCount === 0 && nextCursor !== null;
}
