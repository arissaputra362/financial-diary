import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseGoldAssetInput, parseJson, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { GoldService } from "@/lib/server/services/gold";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const { id } = await params;
    const input = parseGoldAssetInput(await parseJson(request));
    const updated = await GoldService.updateAsset(
      session.householdId,
      id,
      session.userId,
      input,
    );
    const response = NextResponse.json({ ...updated, buyPriceMinor: Number(updated.buyPriceMinor) });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const { id } = await params;

    await GoldService.deleteAsset(session.householdId, id, session.userId);

    const response = NextResponse.json({ success: true, id }, { status: 200 });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
