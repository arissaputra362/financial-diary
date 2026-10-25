import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseGoldAssetInput, parseJson, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { GoldService } from "@/lib/server/services/gold";
import { WalletScope } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");

    const filterScope =
      scopeParam === "PERSONAL"
        ? WalletScope.PERSONAL
        : scopeParam === "SHARING"
        ? WalletScope.SHARING
        : undefined;

    const summary = await GoldService.getPortfolioSummary(
      session.householdId,
      session.userId,
      filterScope
    );

    const response = NextResponse.json(summary, { status: 200 });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const input = parseGoldAssetInput(await parseJson(request));

    const created = await GoldService.createAsset(
      session.householdId,
      session.userId,
      input
    );

    const response = NextResponse.json(
      { ...created, buyPriceMinor: Number(created.buyPriceMinor) },
      { status: 201 },
    );
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
