import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { ocrJobParamsSchema } from "@/lib/server/contracts/ocr";
import { notFound } from "@/lib/server/errors";
import { pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  GET /api/ocr/jobs/{id} → `{ job, draft }` scoped to the caller's household.
  Unknown or cross-household ids resolve to 404 (extended-unique where, ADR-006).
*/
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const params = await context.params;
    const parsed = ocrJobParamsSchema.safeParse({ id: pathParam(params.id) });
    if (!parsed.success) throw notFound("Struk tidak ditemukan.");

    const result = await session.ocr.getJob(
      { userId: session.userId, householdId: session.householdId, role: session.role },
      parsed.data.id,
    );
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}