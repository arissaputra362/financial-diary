import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseListInstitutionsQuery, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  GET /api/institutions?q= — official catalog + the caller's private Quick Add
  lists (active and archived). No `userId` is accepted from the client; both
  private lists are derived from the session in the repository.
*/
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseListInstitutionsQuery(new URL(request.url).searchParams);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const body = await session.institutions.list(actor, query.q);
    const response = NextResponse.json(body);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
