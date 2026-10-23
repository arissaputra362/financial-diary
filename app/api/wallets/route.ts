import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseCreateWallet, parseIdempotencyKey, parseJson, parseListWalletsQuery, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  POST /api/wallets — create a Pribadi/Bersama wallet (AC-F6-1). Scope defaults
  to Pribadi and is create-only (C-31); opening balance is optional (blank = 0).
  GET /api/wallets?view=active|archived|all — A-38 visibility filtered list.
*/
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const body = await parseJson(request);
    const input = parseCreateWallet(body);
    const idempotencyKey = parseIdempotencyKey(request);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result = await session.wallets.create(actor, input, idempotencyKey);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseListWalletsQuery(new URL(request.url).searchParams);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const wallets = await session.wallets.list(actor, query.view ?? "active");
    const response = NextResponse.json({ wallets });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
