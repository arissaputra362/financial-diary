import { AppShell } from "@/components/layout/AppShell";
import { DashboardView } from "@/components/dashboard/DashboardView";

/*
  Dashboard route (feat-dashboard). The client view fetches the single
  server-side aggregation and renders it; no figure is recomputed in the browser.
*/
export default function HomePage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
