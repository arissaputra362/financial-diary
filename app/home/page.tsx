import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthRedirect } from "@/components/auth/AuthRedirect";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { authenticatedRequest } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";
import { Skeleton } from "@/components/ui/Skeleton";

/*
  Dashboard route (feat-dashboard). The client view fetches the single
  server-side aggregation and renders it; no figure is recomputed in the browser.
*/
async function DashboardContent() {
  let initialData;
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    initialData = await session.dashboard.get(
      { userId: session.userId, householdId: session.householdId, role: session.role },
      { periodDays: 7 },
    );
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) return <AuthRedirect to="/login" />;
    if (error instanceof AppError && error.statusCode === 403) {
      return <AuthRedirect to="/waiting-for-approval" />;
    }
    throw error;
  }

  return (
    <DashboardView initialData={initialData} />
  );
}

function DashboardLoading() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12" aria-busy="true">
      <Skeleton className="h-56 lg:col-span-7" />
      <Skeleton className="h-56 lg:col-span-5" />
      <Skeleton className="h-40 lg:col-span-12" />
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent />
      </Suspense>
    </AppShell>
  );
}
