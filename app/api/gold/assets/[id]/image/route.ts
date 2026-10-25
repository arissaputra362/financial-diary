import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { notFound } from "@/lib/server/errors";
import { pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { GoldService } from "@/lib/server/services/gold";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const { id } = await context.params;
    const image = await GoldService.getAssetImage(
      session.householdId,
      session.userId,
      pathParam(id),
    );
    if (!image) throw notFound("Foto hasil pindai tidak tersedia.");

    const response = new NextResponse(image.stream, {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
