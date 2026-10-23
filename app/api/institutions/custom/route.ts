import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import {
  parseIdempotencyKey,
  parseJson,
  parseQuickAddInstitution,
  respondError,
} from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  POST /api/institutions/custom — Quick Add to the caller's private list
  (T-011 / A-57). 201 = new row, 200 = reactivated archived row, 409 =
  normalized-name duplicate. The entry is independent of any wallet, so a later
  wallet cancel never rolls it back.
*/
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const body = await parseJson(request);
    const input = parseQuickAddInstitution(body);
    const idempotencyKey = parseIdempotencyKey(request);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result = await session.institutions.quickAdd(actor, input.name, idempotencyKey);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
