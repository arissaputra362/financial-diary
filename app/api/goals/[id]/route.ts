import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { idSchema } from "@/lib/server/contracts/transactions";
import { adjustSavedSchema } from "@/lib/server/contracts/goals";
import { formatFieldErrors } from "@/lib/server/contracts/common";
import { notFound, unprocessableCode } from "@/lib/server/errors";
import { parseJson, pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  Delta-based saved-amount adjustment (AC-F4-3, D-18). The service performs the
  atomic conditional update; a negative result is 422 SAVED_AMOUNT_INVALID with
  no change, and a trashed goal is 404.
*/
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const id = parseId(await context.params);
    const body = await parseJson(request);
    const parsed = adjustSavedSchema.safeParse(body);
    if (!parsed.success) {
      throw unprocessableCode(
        "SAVED_AMOUNT_INVALID",
        formatFieldErrors(parsed.error),
        "Jumlah perubahan tidak valid.",
      );
    }
    const result = await session.goals.adjustSaved(
      { userId: session.userId, householdId: session.householdId },
      id,
      parsed.data.savedDelta,
    );
    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

function parseId(params: { id: string | string[] | undefined }): string {
  const parsed = idSchema.safeParse(pathParam(params.id));
  if (!parsed.success) throw notFound("Target tidak ditemukan.");
  return parsed.data;
}
