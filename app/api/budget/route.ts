import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import type { BudgetScope } from "@/lib/server/services/budget";
import { parseBudgetQuery, parseBudgetUpsert, parseJson, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

function toBudgetScope(scope: "shared" | "personal" | undefined): BudgetScope {
  return scope === "personal" ? "PERSONAL" : "SHARED";
}

/**
 * GET /api/budget?scope=shared|personal: current Asia/Jakarta month budget +
 * spent/remaining for one independent scope (AC-F2-2, AC-F2-2c). Default
 * `shared`. Personal is always resolved from the session user.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseBudgetQuery(new URL(request.url).searchParams);
    const scope = toBudgetScope(query.scope);
    const dto =
      scope === "PERSONAL"
        ? await session.budget.getPersonal({
            userId: session.userId,
            householdId: session.householdId,
          })
        : await session.budget.get(session.householdId);
    const response = NextResponse.json(dto);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

/**
 * PUT /api/budget body `{ amountMinor, scope? }`: upsert the current month for
 * one scope (AC-F2-3, AC-F2-2c). `shared` stays OWNER-only; `personal` writes
 * only the session user's own row. There is no `userId` input.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const body = await parseJson(request);
    const input = parseBudgetUpsert(body);
    const dto = await session.budget.upsert(
      {
        userId: session.userId,
        role: session.role,
        householdId: session.householdId,
      },
      session.householdId,
      input.amountMinor,
      toBudgetScope(input.scope),
    );
    const response = NextResponse.json(dto);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
