import { AppShell } from "@/components/layout/AppShell";
import { ActivityView } from "@/components/transactions/ActivityView";
import type { ActivityPeriod, ActivityScopeFilter, ActivityTypeFilter } from "@/components/transactions/activityUrl";
import { CATEGORIES } from "@/lib/server/contracts/transactions";
import { resolveMonthKey } from "@/lib/dates";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseFilter(value: string | string[] | undefined): ActivityTypeFilter {
  return value === "in" || value === "out" || value === "transfer" ? value : "all";
}

/*
  Activity page (nav label "Activity", A-31). Trash is a tab on this page:
  `/transactions?view=trash`. Ringkasan is a separate view opened from the
  monthly summary card: `/transactions?view=ringkasan&month=YYYY-MM`. The selected month is
  deep-linked so refresh, back/forward, and shared links all restore the same
  view (invalid keys fall back to the current month). The Add flow is an action
  from here, not a route.
*/
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view =
    params.view === "trash" ? "trash" : params.view === "ringkasan" ? "ringkasan" : "active";
  const month = resolveMonthKey(typeof params.month === "string" ? params.month : undefined);
  /*
    Period is independent of the month now: a rolling 7/30-day window or a
    custom range may span months, which fits paydays that are not on the 1st.
  */
  const period: ActivityPeriod =
    params.period === "7d" ? "7d" :
    params.period === "30d" ? "30d" :
    params.period === "range" ? "range" : "month";
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const rangeView = view === "active" || view === "ringkasan";
  const from = rangeView && typeof params.from === "string" && DATE_ONLY.test(params.from)
    ? params.from
    : undefined;
  const to = rangeView && typeof params.to === "string" && DATE_ONLY.test(params.to)
    ? params.to
    : undefined;
  const filter = view === "active" ? parseFilter(params.filter) : "all";
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const categories = [
    ...new Set(
      (Array.isArray(params.category) ? params.category : params.category ? [params.category] : [])
        .filter((value): value is string =>
          typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)),
    ),
  ];
  const transactionScope: ActivityScopeFilter =
    params.scope === "personal" || params.scope === "PERSONAL" ? "personal" :
    params.scope === "shared" || params.scope === "SHARING" ? "shared" : "all";
  const walletIds = [...new Set((Array.isArray(params.wallet) ? params.wallet : [params.wallet])
    .filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value)))].slice(0, 50);
  const reportScope = view === "ringkasan" && params.scope === "personal" ? "personal" :
    view === "ringkasan" && params.scope === "shared" ? "shared" : "all";
  /* `?add=1` opens the add sheet: nav "Tambah" and the dashboard link here (A-27). */
  const initialAdd = params.add === "1";
  const initialScan = initialAdd && params.scan === "1";
  const initialTransactionType =
    initialAdd && params.type === "TRANSFER" ? "TRANSFER" as const :
    initialAdd && params.type === "MONEY_IN" ? "MONEY_IN" as const : "MONEY_OUT" as const;
  return (
    <AppShell>
      {/* Keyed by view + month only. `add` is an intent handled inside
          ActivityView, never a remount trigger (AC-F3-14). Report scope/wallet
          travel in the URL so a month remount restores them (AC-F7-2). */}
      <ActivityView
        key={`${view}-${month}`}
        initialView={view}
        initialMonth={month}
        initialPeriod={period}
        initialQ={q}
        initialCategories={categories}
        initialFrom={from}
        initialTo={to}
        initialAdd={initialAdd}
        initialScan={initialScan}
        initialTransactionType={initialTransactionType}
        initialFilter={filter}
        initialScope={transactionScope}
        initialWalletIds={view === "active" ? walletIds : undefined}
        initialReportScope={reportScope}
        initialReportWalletIds={view === "ringkasan" ? walletIds : undefined}
      />
    </AppShell>
  );
}
