import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { idSchema } from "@/lib/server/contracts/transactions";
import { notFound } from "@/lib/server/errors";
import { pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  Restore a soft-deleted transaction (undo toast / trash tab). Conditional
  update + rowcount makes a second restore idempotent: ALREADY_ACTIVE (A-17).
  Cross-household or unknown ids resolve to 404 via the extended-unique where.
*/
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const id = parseId(await context.params);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result = await session.transactions.restore(actor, id);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

function parseId(params: { id: string | string[] | undefined }): string {
  const parsed = idSchema.safeParse(pathParam(params.id));
  if (!parsed.success) throw notFound("Transaksi tidak ditemukan.");
  return parsed.data;
}