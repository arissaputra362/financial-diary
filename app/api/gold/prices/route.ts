import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { GoldPriceService } from "@/lib/server/services/gold-price";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const prices = await GoldPriceService.getDailyPrices();

    const response = NextResponse.json(prices, { status: 200 });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
