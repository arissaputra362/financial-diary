import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseGoalTrashListQuery, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/** Trash list for goals: soft-deleted rows only, newest first (feat 5 pattern). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseGoalTrashListQuery(new URL(request.url).searchParams);
    const result = await session.goals.listTrash(session.householdId, query.cursor ?? null, query.limit);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
