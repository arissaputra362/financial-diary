import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseJson, parseUpdateProfile, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest();
    const input = parseUpdateProfile(await parseJson(request));
    const updated = await session.auth.updateProfile(session.userId, input);
    const response = NextResponse.json(updated);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
