import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
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
    if (error instanceof AppError && error.statusCode === 401) redirect("/login");
    if (error instanceof AppError && error.statusCode === 403) redirect("/waiting-for-approval");
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
