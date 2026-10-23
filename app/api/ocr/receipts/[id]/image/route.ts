import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { idSchema } from "@/lib/server/contracts/transactions";
import { notFound } from "@/lib/server/errors";
import { pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/*
  GET /api/ocr/receipts/{id}/image — authenticated private receipt image (C-30).

  Authorization uses the A-46/C-28 image union (uploader or a receipt linked to a
  wallet-visible transaction, including soft-deleted links). The response is
  private Blob bytes only: allowlisted Content-Type, `Cache-Control: private,
  no-store`, generic 404 on unauthorized/foreign/no-link. It never returns a
  Blob URL, storage key, token, OCR job/draft/`result_json`, or a transaction row.
*/
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const params = await context.params;
    const parsed = idSchema.safeParse(pathParam(params.id));
    if (!parsed.success) throw notFound("Struk tidak tersedia.");
    const actor = { userId: session.userId, householdId: session.householdId, role: session.role };
    const image = await session.ocr.getReceiptImage(actor, parsed.data);
    if (!image) throw notFound("Struk tidak tersedia.");
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
