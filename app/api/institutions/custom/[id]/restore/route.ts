import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { idSchema } from "@/lib/server/contracts/transactions";
import { notFound } from "@/lib/server/errors";
import { pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  POST /api/institutions/custom/{id}/restore — reactivate the caller's own
  archived entry (T-011 / A-54). Foreign/unknown ids resolve to a generic 404.
*/
function parseId(params: { id: string | string[] | undefined }): string {
  const parsed = idSchema.safeParse(pathParam(params.id));
  if (!parsed.success) throw notFound("Bank atau penyedia tidak ditemukan.");
  return parsed.data;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const id = parseId(await context.params);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const body = await session.institutions.setArchived(actor, id, false);
    const response = NextResponse.json(body);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
