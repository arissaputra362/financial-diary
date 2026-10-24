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
  const startedAt = performance.now();
  try {
    const authStartedAt = performance.now();
    const session = await authenticatedRequest({ approvedOnly: true });
    const authDuration = performance.now() - authStartedAt;
    const query = parseDashboardQuery(new URL(request.url).searchParams);
    const periodDays = DASHBOARD_PERIODS[query.period ?? "7D"];
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const dashboardStartedAt = performance.now();
    const dto = await session.dashboard.get(actor, { periodDays });
    const dashboardDuration = performance.now() - dashboardStartedAt;
    const response = NextResponse.json(dto);
    response.headers.set(
      "Server-Timing",
      `auth;dur=${authDuration.toFixed(1)},dashboard;dur=${dashboardDuration.toFixed(1)},total;dur=${(performance.now() - startedAt).toFixed(1)}`,
    );
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
