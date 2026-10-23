import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { idSchema } from "@/lib/server/contracts/transactions";
import { notFound } from "@/lib/server/errors";
import { pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  POST /api/wallets/{id}/restore — restore an archived wallet (A-43/C-22).
  Permission: SHARING = creator or Owner; PERSONAL = owner only.
*/
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const params = await context.params;
    const parsed = idSchema.safeParse(pathParam(params.id));
    if (!parsed.success) throw notFound("Dompet tidak ditemukan.");
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result = await session.wallets.restore(actor, parsed.data);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
