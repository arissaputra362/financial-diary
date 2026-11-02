import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseActivityWalletSummaryQuery, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseActivityWalletSummaryQuery(new URL(request.url).searchParams);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const summary = await session.reports.activityWalletSummary(actor, query);
    const response = NextResponse.json(summary);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
