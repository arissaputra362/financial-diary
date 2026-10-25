import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { fileInvalid } from "@/lib/server/errors";
import { respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { GoldVisionProvider } from "@/lib/server/providers/gold-vision";
import { GoldBrand } from "@/lib/generated/prisma/enums";
import type { GoldScanResultDTO } from "@/types/gold";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });

    const form = await request.formData();
    const file = form.get("file");
    if (!isFile(file)) {
      throw fileInvalid("Pilih foto certicard atau nota emas terlebih dahulu.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";

    let scanResult: GoldScanResultDTO;
    try {
      scanResult = await GoldVisionProvider.scanGoldImage(bytes, mimeType);
    } catch (err) {
      console.warn("[GoldScanRoute] Gemini extraction failed, using default draft", err);
      // Safe fallback so Review Form opens smoothly even if Vision API timed out
      scanResult = {
        scanType: "UNKNOWN",
        brand: GoldBrand.OTHER,
        name: "Emas (Hasil Pindai)",
        weightGrams: 1.0,
        purityPermille: 999,
        confidence: 0.2,
      };
    }

    const response = NextResponse.json(scanResult, { status: 200 });
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
