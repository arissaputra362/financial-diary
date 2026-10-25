import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseJson, parseUpdateHousehold, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const input = parseUpdateHousehold(await parseJson(request));
    const household = await session.family.updateHouseholdName(
      session.userId,
      session.householdId,
      input,
    );
    const response = NextResponse.json(household);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
