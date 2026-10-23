import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { ocrJobParamsSchema } from "@/lib/server/contracts/ocr";
import { notFound } from "@/lib/server/errors";
import { parseRequiredIdempotencyKey, pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";
/* Retry runs the model synchronously inside the request (same as upload, D-8). */
export const maxDuration = 30;

/*
  POST /api/ocr/jobs/{id}/retry (T-012 / AC-F3-10..13).

  No request body and no file: the server re-reads the already-stored private
  bytes. `Idempotency-Key` is required so one tap is one execution and a
  double-tap replays. Only the latest FAILED job of the original uploader is
  retryable; missing/foreign/non-uploader jobs share one generic 404. A model
  failure stays HTTP 200 `{ job: FAILED, draft: null }` like the upload path.
*/
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const idempotencyKey = parseRequiredIdempotencyKey(request);
    const params = await context.params;
    const parsed = ocrJobParamsSchema.safeParse({ id: pathParam(params.id) });
    if (!parsed.success) throw notFound("Struk tidak ditemukan.");

    const result = await session.ocr.retry(
      { userId: session.userId, householdId: session.householdId, role: session.role },
      parsed.data.id,
      idempotencyKey,
    );
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
