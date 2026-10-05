import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const members = await session.family.listMembers(session.userId, session.householdId);
    const response = NextResponse.json(members);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
