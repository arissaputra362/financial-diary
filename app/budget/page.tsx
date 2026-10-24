import { AppShell } from "@/components/layout/AppShell";
import { AuthRedirect } from "@/components/auth/AuthRedirect";
import { BudgetView } from "@/components/dashboard/BudgetView";
import { authenticatedRequest } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";

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
  let initialData;
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const [shared, personal] = await Promise.all([
      session.budget.get(session.householdId),
      session.budget.getPersonal(actor),
    ]);
    initialData = {
      me: session.state,
      budgets: { SHARED: shared, PERSONAL: personal },
    };
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) return <AuthRedirect to="/login" />;
    if (error instanceof AppError && error.statusCode === 403) {
      return <AuthRedirect to="/waiting-for-approval" />;
    }
    throw error;
  }

  return (
    <AppShell>
      <BudgetView initialScope={initialScope} initialData={initialData} />
    </AppShell>
  );
}
