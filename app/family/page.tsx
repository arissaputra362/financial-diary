import { AppShell } from "@/components/layout/AppShell";
import { AuthRedirect } from "@/components/auth/AuthRedirect";
import FamilyView from "@/components/family/FamilyView";
import { authenticatedRequest } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";

export default async function FamilyPage() {
  let session;
  let members;
  try {
    session = await authenticatedRequest({ approvedOnly: true });
    members = await session.family.listMembers(session.userId, session.householdId);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) return <AuthRedirect to="/login" />;
    if (error instanceof AppError && error.statusCode === 403) {
      return <AuthRedirect to="/waiting-for-approval" />;
    }
    throw error;
  }

  return (
    <AppShell>
      <FamilyView
        initialMe={{
          user: session.state.user,
          household: session.state.household,
          role: session.state.role,
          status: session.state.status,
        }}
        initialMembers={members}
      />
    </AppShell>
  );
}
