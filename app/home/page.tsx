import { AppShell } from "@/components/layout/AppShell";
import { DashboardView } from "@/components/dashboard/DashboardView";

/*
  Dashboard route (feat-dashboard). The shell renders immediately and the client
  view fetches the aggregation, avoiding a long RSC wait on mobile Safari.
*/
export default function HomePage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
