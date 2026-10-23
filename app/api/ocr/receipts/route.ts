import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { fileInvalid } from "@/lib/server/errors";
import { parseIdempotencyKey, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";
/* OCR runs synchronously within the request (no background worker, D-8). */
export const maxDuration = 30;

/*
  POST /api/ocr/receipts — server-proxied receipt upload + Gemini Vision draft.

  NEVER creates a transaction (AC-F3-4). Model failures stay HTTP 200 with
  `{ job: { status: "FAILED", errorCode }, draft: null }` (A-10/D-12); boundary
  violations are 422 FILE_INVALID (A-02/A-21); a duplicate content hash is a
  committed 409 DUPLICATE_RECEIPT carrying the existing job/draft (A-11 replay).
*/
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const idempotencyKey = parseIdempotencyKey(request);

    const form = await request.formData();
    const file = form.get("file");
    if (!isFile(file)) throw fileInvalid("Pilih foto struk dulu.");

    const result = await session.ocr.upload(
      { userId: session.userId, householdId: session.householdId, role: session.role },
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type,
        sizeBytes: file.size,
        filename: file.name,
      },
      idempotencyKey,
    );

    const response = NextResponse.json(result.body, { status: result.status });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

function isFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).type === "string"
  );
}