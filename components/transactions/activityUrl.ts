/*
  One URL writer for the Activity page (AC-F3-14). The Add sheet intent is the
  single `add=1` parameter; the selected month and the Trash tab travel with it
  so closing the sheet only removes the intent and never resets the view.
*/

import { monthKeyRange } from "@/lib/dates";

export type ActivityViewMode = "active" | "trash";

export interface ActivityHrefInput {
  view: ActivityViewMode;
  month: string;
  add?: boolean;
  from?: string;
  to?: string;
}

export function activityHref({ view, month, add = false, from, to }: ActivityHrefInput): string {
  const params = new URLSearchParams();
  if (view === "trash") params.set("view", "trash");
  params.set("month", month);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (add) params.set("add", "1");
  return `/transactions?${params.toString()}`;
}

export interface ActivityListUrlInput {
  view: ActivityViewMode;
  cursor?: string | null;
  month: string;
  walletId?: string;
  from?: string;
  to?: string;
}

/*
  One query builder for the activity list. An empty date filter means "whole
  selected month", so it must fall back to `monthKeyRange` instead of sending
  `from=` / `to=` (the API rejects an empty date and the list shows an error).
*/
export function activityListUrl({
  view,
  cursor,
  month,
  walletId,
  from,
  to,
}: ActivityListUrlInput): string {
  const base = view === "trash" ? "/api/transactions/trash" : "/api/transactions";
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (view === "active") {
    const monthRange = monthKeyRange(month);
    params.set("from", from || monthRange.from);
    params.set("to", to || monthRange.to);
    if (walletId) params.set("walletId", walletId);
  }
  const queryString = params.toString();
  return queryString ? `${base}?${queryString}` : base;
}
