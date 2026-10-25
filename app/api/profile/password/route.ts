import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseChangePassword, parseJson, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest();
    const input = parseChangePassword(await parseJson(request));
    await session.auth.changePassword(session.userId, session.sessionId, input);
    const response = NextResponse.json({ updated: true });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
