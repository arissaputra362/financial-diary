import { AppShell } from "@/components/layout/AppShell";
import { ActivityView } from "@/components/transactions/ActivityView";
import { resolveMonthKey } from "@/lib/dates";
import { monthKeyRange } from "@/lib/dates";
import { authenticatedRequest } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";
import { redirect } from "next/navigation";
import type { TransactionListDTO } from "@/types/api";

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
  let initialData: TransactionListDTO;
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result =
      view === "trash"
        ? await session.transactions.listTrash(actor)
        : await session.transactions.list(actor, { ...monthKeyRange(month) });
    initialData = result.body as TransactionListDTO;
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) redirect("/login");
    if (error instanceof AppError && error.statusCode === 403) redirect("/waiting-for-approval");
    throw error;
  }
  return (
    <AppShell>
      {/* Keyed by view + month only. `add` is an intent handled inside
          ActivityView, never a remount trigger (AC-F3-14). */}
      <ActivityView
        key={`${view}-${month}`}
        initialView={view}
        initialMonth={month}
        initialAdd={initialAdd}
        initialData={initialData}
      />
    </AppShell>
  );
}
