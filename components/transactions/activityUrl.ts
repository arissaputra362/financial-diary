/*
  One URL writer for the Activity page (AC-F3-14, AC-F7-1/2/6). The Add sheet
  intent is the single `add=1` parameter; the selected month, view, type filter,
  wallet, and report scope travel with it so closing a sheet or changing a month
  never resets the other controls.
*/

import { monthKeyRange } from "@/lib/dates";

export type ActivityViewMode = "active" | "ringkasan" | "trash";
export type ActivityTypeFilter = "all" | "in" | "out" | "transfer";
export type ActivityScopeFilter = "all" | "personal" | "shared";
/** Active-list period: current month, a rolling window, or a custom date range. */
export type ActivityPeriod = "month" | "7d" | "30d" | "range";

export interface ActivityHrefInput {
  view: ActivityViewMode;
  month: string;
  period?: ActivityPeriod;
  add?: boolean;
  from?: string;
  to?: string;
  filter?: ActivityTypeFilter;
  scope?: ActivityScopeFilter;
  /** Free-text search across merchant and note. */
  q?: string;
  /** Multi-select category filter. */
  categories?: string[];
  /** Active tab wallet filter, or the selected report wallet on Ringkasan. */
  walletId?: string;
  /** Active tab wallet selection; repeated in the URL to support multi-select. */
  walletIds?: string[];
  /** Ringkasan lengkap wallet selection; repeated in the URL. */
  reportWalletIds?: string[];
  /** Ringkasan scope; `all` is the default and is omitted from the URL. */
  reportScope?: "all" | "shared" | "personal";
}

export function activityHref({
  view,
  month,
  period = "month",
  add = false,
  from,
  to,
  filter = "all",
  scope = "all",
  q,
  categories,
  walletId,
  walletIds,
  reportWalletIds,
  reportScope = "all",
}: ActivityHrefInput): string {
  const params = new URLSearchParams();
  const activeWalletIds = walletIds?.length ? walletIds : walletId ? [walletId] : [];
  const explicitActive = view === "active" && (filter !== "all" || scope !== "all" || activeWalletIds.length > 0);
  if (view === "trash") params.set("view", "trash");
  else if (view === "ringkasan") params.set("view", "ringkasan");
  else if (explicitActive) params.set("view", "active");
  params.set("month", month);

  if (view === "active" || view === "ringkasan") {
    const hasExplicitRange = Boolean(from || to);
    if (!hasExplicitRange && period !== "month") params.set("period", period);
    /* Only a custom range carries explicit from/to; rolling windows are derived. */
    if (hasExplicitRange || period === "range") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
  }
  if (view === "active") {
    if (filter !== "all") params.set("filter", filter);
    if (scope !== "all") params.set("scope", scope);
    if (q) params.set("q", q);
    categories?.forEach((value) => params.append("category", value));
  }
  if (view === "ringkasan" && reportScope !== "all") params.set("scope", reportScope);
  if (view === "active") activeWalletIds.forEach((id) => params.append("wallet", id));
  else if (view === "ringkasan") {
    const selectedReportWalletIds = reportWalletIds?.length ? reportWalletIds : walletId ? [walletId] : [];
    selectedReportWalletIds.forEach((id) => params.append("wallet", id));
  }
  if (add) params.set("add", "1");
  return `/transactions?${params.toString()}`;
}

export interface ActivityListUrlInput {
  view: "active" | "trash";
  cursor?: string | null;
  month: string;
  walletId?: string;
  walletIds?: string[];
  from?: string;
  to?: string;
  /** `in`/`out` are filtered by the API so pagination counts matching rows. */
  filter?: ActivityTypeFilter;
  scope?: ActivityScopeFilter;
  q?: string;
  categories?: string[];
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
  walletIds,
  from,
  to,
  filter = "all",
  scope = "all",
  q,
  categories,
}: ActivityListUrlInput): string {
  const base = view === "trash" ? "/api/transactions/trash" : "/api/transactions";
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (view === "active") {
    const monthRange = monthKeyRange(month);
    params.set("from", from || monthRange.from);
    params.set("to", to || monthRange.to);
    const selectedWalletIds = walletIds?.length ? walletIds : walletId ? [walletId] : [];
    selectedWalletIds.forEach((id) => params.append("walletId", id));
    if (filter === "in") params.set("type", "MONEY_IN");
    else if (filter === "out") params.set("type", "MONEY_OUT");
    if (scope !== "all") params.set("scope", scope === "personal" ? "PERSONAL" : "SHARING");
    if (q) params.set("q", q);
    categories?.forEach((value) => params.append("category", value));
  }
  const queryString = params.toString();
  return queryString ? `${base}?${queryString}` : base;
}
