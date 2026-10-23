import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { idSchema } from "@/lib/server/contracts/transactions";
import { notFound } from "@/lib/server/errors";
import { parseJson, parseUpdateWallet, pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  GET   /api/wallets/{id} — visible wallet detail (A-38).
  PATCH /api/wallets/{id} — name/purpose/opening only; a `scope` field is
  rejected 422 (C-31). Unknown/private/foreign ids resolve to 404.
*/
function parseId(params: { id: string | string[] | undefined }): string {
  const parsed = idSchema.safeParse(pathParam(params.id));
  if (!parsed.success) throw notFound("Dompet tidak ditemukan.");
  return parsed.data;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const id = parseId(await context.params);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const dto = await session.wallets.get(actor, id);
    const response = NextResponse.json(dto);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const id = parseId(await context.params);
    const body = await parseJson(request);
    const patch = parseUpdateWallet(body);
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const result = await session.wallets.update(actor, id, patch);
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
