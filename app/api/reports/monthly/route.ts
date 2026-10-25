import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseReportQuery, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  GET /api/reports/monthly?month=YYYY-MM&scope=shared|personal&walletId=<uuid>

  One aggregate response for one month + scope + wallet combination
  (AC-F7-14). The Ringkasan tab renders it directly and never sums rows.
  Approved members only.
*/
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseReportQuery(new URL(request.url).searchParams);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const report = await session.reports.get(actor, query);
    const response = NextResponse.json(report);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
