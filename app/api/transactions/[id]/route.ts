import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { idSchema } from "@/lib/server/contracts/transactions";
import { notFound } from "@/lib/server/errors";
import { parseJson, parseUpdateTransaction, pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/** Update one active non-transfer transaction while preserving its identity. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const params = await context.params;
    const parsedId = idSchema.safeParse(pathParam(params.id));
    if (!parsedId.success) throw notFound("Transaksi tidak ditemukan.");
    const input = parseUpdateTransaction(await parseJson(request));
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result = await session.transactions.update(actor, parsedId.data, input);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
