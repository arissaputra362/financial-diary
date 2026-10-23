import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseTrashListQuery, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  Trash tab data source: soft-deleted transactions only, ordered by
  `deleted_at DESC` (feat-trash-restore contract, A-31 `/transactions?view=trash`).
  Separate from the active list; permanent delete does not exist in the MVP.
*/
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseTrashListQuery(new URL(request.url).searchParams);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result = await session.transactions.listTrash(
      actor,
      query.cursor ?? null,
      query.limit,
    );
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}