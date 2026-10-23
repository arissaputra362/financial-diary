import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import {
  parseCreateTransaction,
  parseIdempotencyKey,
  parseJson,
  parseListTransactionsQuery,
  respondError,
} from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  POST creates a manual transaction (money in/out/transfer) OR a transaction
  from a reviewed OCR draft (`source=OCR` + `receiptId`). It never creates
  anything from the OCR endpoint itself (AC-F3-4). No PATCH route exists in the
  MVP (A-08/D-15).
*/
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const body = await parseJson(request);
    const input = parseCreateTransaction(body);
    const idempotencyKey = parseIdempotencyKey(request);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };

    const result =
      input.source === "OCR"
        ? await session.transactions.createFromOcr(actor, input, idempotencyKey)
        : await session.transactions.createManual(actor, input, idempotencyKey);

    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

/** Active activity list, keyset cursor + filters (A-14, feat-dashboard contract). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const query = parseListTransactionsQuery(new URL(request.url).searchParams);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result = await session.transactions.list(actor, query);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}