import { AppShell } from "@/components/layout/AppShell";
import { BudgetView } from "@/components/dashboard/BudgetView";

/*
  Budget route (feat-dashboard AC-F2-2/AC-F2-3, AC-F2-2c). `?scope=personal`
  opens the page on the viewer's own cap; every other value keeps the household
  `Bersama` default. Reading search params here (server component) avoids adding
  a Suspense boundary around the client view.
*/
export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const initialScope = query.scope === "personal" ? "PERSONAL" : "SHARED";

  return (
    <AppShell>
      <BudgetView initialScope={initialScope} />
    </AppShell>
  );
}
