import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { respondError } from "@/lib/server/http";
import { clearSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest();
    await session.auth.logout(session.sessionId);
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
