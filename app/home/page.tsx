import { AppShell } from "@/components/layout/AppShell";
import { AuthRedirect } from "@/components/auth/AuthRedirect";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { authenticatedRequest } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";

/*
  Dashboard route (feat-dashboard). The client view fetches the single
  server-side aggregation and renders it; no figure is recomputed in the browser.
*/
export default async function HomePage() {
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
    <AppShell>
      <DashboardView initialData={initialData} />
    </AppShell>
  );
}
