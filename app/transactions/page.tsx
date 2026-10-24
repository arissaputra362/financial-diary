import { AppShell } from "@/components/layout/AppShell";
import { ActivityView } from "@/components/transactions/ActivityView";
import { resolveMonthKey } from "@/lib/dates";

/*
  Activity page (nav label "Activity", A-31). Trash is a tab on this page:
  `/transactions?view=trash`. The selected month is deep-linked as
  `/transactions?month=YYYY-MM` so refresh, back/forward, and shared links all
  restore the same view (invalid keys fall back to the current month). The Add
  flow is an action from here, not a route.
*/
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = params.view === "trash" ? "trash" : "active";
  const month = resolveMonthKey(typeof params.month === "string" ? params.month : undefined);
  /* `?add=1` opens the add sheet: nav "Tambah" and the dashboard link here (A-27). */
  const initialAdd = params.add === "1";
  return (
    <AppShell>
      {/* Keyed by view + month only. `add` is an intent handled inside
          ActivityView, never a remount trigger (AC-F3-14). */}
      <ActivityView
        key={`${view}-${month}`}
        initialView={view}
        initialMonth={month}
        initialAdd={initialAdd}
      />
    </AppShell>
  );
}
