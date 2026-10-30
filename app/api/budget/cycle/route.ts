import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import type { BudgetScope } from "@/lib/server/services/budget";
import { parseBudgetCycleUpdate, parseJson, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

function toBudgetScope(scope: "shared" | "personal" | undefined): BudgetScope {
  return scope === "personal" ? "PERSONAL" : "SHARED";
}

/**
 * PUT /api/budget/cycle body `{ scope?, mode, day? }` (AC-F2-2d). Schedules the
 * chosen cycle from the next period boundary. `shared` stays OWNER-only;
 * `personal` changes only the session user's own cycle.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const body = await parseJson(request);
    const input = parseBudgetCycleUpdate(body);
    const scope = toBudgetScope(input.scope);
    const dto = await session.budget.updateCycle(
      {
        userId: session.userId,
        role: session.role,
        householdId: session.householdId,
      },
      session.householdId,
      { mode: input.mode, day: input.day ?? null },
      scope,
    );
    const response = NextResponse.json(dto);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
