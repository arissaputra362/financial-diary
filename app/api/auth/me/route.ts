import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest();
    const response = NextResponse.json({
      user: session.state.user,
      household: session.state.household,
      role: session.state.role,
      status: session.state.status,
    });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
