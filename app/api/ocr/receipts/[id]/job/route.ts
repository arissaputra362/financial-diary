import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { ocrJobParamsSchema } from "@/lib/server/contracts/ocr";
import { pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/**
 * GET /api/ocr/receipts/{id}/job → latest uploader-owned job.
 * This endpoint is intentionally metadata-only: it never accepts receipt bytes.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const params = await context.params;
    const parsed = ocrJobParamsSchema.safeParse({ id: pathParam(params.id) });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Struk tidak ditemukan.", fieldErrors: null } },
        { status: 404 },
      );
    }

    const result = await session.ocr.getLatestJobForReceipt(
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
