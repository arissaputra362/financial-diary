/*
  One URL writer for the Activity page (AC-F3-14, AC-F7-1/2/6). The Add sheet
  intent is the single `add=1` parameter; the selected month, view, type filter,
  wallet, and report scope travel with it so closing a sheet or changing a month
  never resets the other controls.
*/

import { monthKeyRange } from "@/lib/dates";

export type ActivityViewMode = "active" | "ringkasan" | "trash";
export type ActivityTypeFilter = "all" | "in" | "out" | "transfer";

export interface ActivityHrefInput {
  view: ActivityViewMode;
  month: string;
  add?: boolean;
  from?: string;
  to?: string;
  filter?: ActivityTypeFilter;
  /** Active tab wallet filter, or the selected report wallet on Ringkasan. */
  walletId?: string;
  /** Ringkasan only; `shared` is the default and is omitted from the URL. */
  reportScope?: "shared" | "personal";
}

export function activityHref({
  view,
  month,
  add = false,
  from,
  to,
  filter = "all",
  walletId,
  reportScope = "shared",
}: ActivityHrefInput): string {
  const params = new URLSearchParams();
  const explicitActive = view === "active" && (filter !== "all" || Boolean(walletId));
  if (view === "trash") params.set("view", "trash");
  else if (view === "ringkasan") params.set("view", "ringkasan");
  else if (explicitActive) params.set("view", "active");
  params.set("month", month);

  if (view === "active") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (filter !== "all") params.set("filter", filter);
  }
  if (view === "ringkasan" && reportScope === "personal") params.set("scope", "personal");
  if (view !== "trash" && walletId) params.set("wallet", walletId);
  if (add) params.set("add", "1");
  return `/transactions?${params.toString()}`;
}

export interface ActivityListUrlInput {
  view: "active" | "trash";
  cursor?: string | null;
  month: string;
  walletId?: string;
  from?: string;
  to?: string;
  /** `in`/`out` are filtered by the API so pagination counts matching rows. */
  filter?: ActivityTypeFilter;
}

/*
  One query builder for the activity list. An empty date filter means "whole
  selected month", so it must fall back to `monthKeyRange` instead of sending
  `from=` / `to=` (the API rejects an empty date and the list shows an error).
  Uang masuk/keluar map to the list API `type` filter (AC-F2-6) so the first
  page is not a false empty while matching rows sit on a later page.
*/
export function activityListUrl({
  view,
  cursor,
  month,
  walletId,
  from,
  to,
  filter = "all",
}: ActivityListUrlInput): string {
  const base = view === "trash" ? "/api/transactions/trash" : "/api/transactions";
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (view === "active") {
    const monthRange = monthKeyRange(month);
    params.set("from", from || monthRange.from);
    params.set("to", to || monthRange.to);
    if (walletId) params.set("walletId", walletId);
    if (filter === "in") params.set("type", "MONEY_IN");
    else if (filter === "out") params.set("type", "MONEY_OUT");
  }
  const queryString = params.toString();
  return queryString ? `${base}?${queryString}` : base;
}
