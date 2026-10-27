import { AppShell } from "@/components/layout/AppShell";
import { ActivityView } from "@/components/transactions/ActivityView";
import type { ActivityScopeFilter, ActivityTypeFilter } from "@/components/transactions/activityUrl";
import { monthKeyRange, resolveMonthKey } from "@/lib/dates";

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
  const monthRange = monthKeyRange(month);
  const from =
    view === "active" &&
    typeof params.from === "string" &&
    params.from >= monthRange.from &&
    params.from <= monthRange.to
      ? params.from
      : undefined;
  const to =
    view === "active" &&
    typeof params.to === "string" &&
    params.to >= monthRange.from &&
    params.to <= monthRange.to
      ? params.to
      : undefined;
  const filter = view === "active" ? parseFilter(params.filter) : "all";
  const transactionScope: ActivityScopeFilter =
    params.scope === "personal" || params.scope === "PERSONAL" ? "personal" :
    params.scope === "shared" || params.scope === "SHARING" ? "shared" : "all";
  const walletId =
    typeof params.wallet === "string" && UUID_PATTERN.test(params.wallet)
      ? params.wallet
      : undefined;
  const reportScope = view === "ringkasan" && params.scope === "personal" ? "personal" :
    view === "ringkasan" && params.scope === "shared" ? "shared" : "all";
  /* `?add=1` opens the add sheet: nav "Tambah" and the dashboard link here (A-27). */
  const initialAdd = params.add === "1";
  return (
    <AppShell>
      {/* Keyed by view + month only. `add` is an intent handled inside
          ActivityView, never a remount trigger (AC-F3-14). Report scope/wallet
          travel in the URL so a month remount restores them (AC-F7-2). */}
      <ActivityView
        key={`${view}-${month}`}
        initialView={view}
        initialMonth={month}
        initialFrom={from}
        initialTo={to}
        initialAdd={initialAdd}
        initialFilter={filter}
        initialScope={transactionScope}
        initialWalletId={view === "active" ? walletId : undefined}
        initialReportScope={reportScope}
        initialReportWalletId={view === "ringkasan" ? walletId : undefined}
      />
    </AppShell>
  );
}
