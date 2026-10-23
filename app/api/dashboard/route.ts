import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { DASHBOARD_PERIODS } from "@/lib/server/contracts/dashboard";
import { parseDashboardQuery, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  GET /api/dashboard?period=7D|30D|90D

  One server-side aggregation (AC-F2-1..AC-F2-9). `period` selects the chart
  window; it defaults to 7D. Balance, budget, goals, and the activity preview are
  independent of the filter controls, which only ever scope the activity list
  (AC-F2-6). Approved members only.
*/
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseDashboardQuery(new URL(request.url).searchParams);
    const periodDays = DASHBOARD_PERIODS[query.period ?? "7D"];
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const dto = await session.dashboard.get(actor, { periodDays });
    const response = NextResponse.json(dto);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
