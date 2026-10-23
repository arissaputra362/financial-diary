import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseCreateGoal, parseIdempotencyKey, parseJson, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  Goals list (active only, AC-F4-4 uses the trash routes) + creation
  (AC-F4-1). Duplicate names are allowed; target > 0 is enforced; POST
  supports Idempotency-Key (A-11). Writing a goal is not owner-only.
*/
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const body = await parseJson(request);
    const input = parseCreateGoal(body);
    const idempotencyKey = parseIdempotencyKey(request);
    const actor = { userId: session.userId, householdId: session.householdId };
    const result = await session.goals.create(actor, input, idempotencyKey);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

/** Active goals for the household, ordered by deadline then id. */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const result = await session.goals.list(session.householdId);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
