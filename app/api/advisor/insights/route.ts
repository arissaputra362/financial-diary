import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseAdvisorInsightRequest, parseIdempotencyKey, parseJson, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  Advisor insight (AC-F4-5..AC-F4-8). Cache-first per (household, period) with
  a 24 h TTL; a miss calls the Gemini seam synchronously (fail-closed, typed
  429/503/422, no per-record data). Only successful insights are persisted.
  Supports Idempotency-Key like every POST mutation (A-11).
*/
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const body = await parseJson(request);
    const input = parseAdvisorInsightRequest(body);
    const idempotencyKey = parseIdempotencyKey(request);
    const result = await session.advisor.getInsight(
      { userId: session.userId, householdId: session.householdId },
      input.period,
      idempotencyKey,
    );
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
