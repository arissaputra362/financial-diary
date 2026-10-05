import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ membershipId: string }> };

export async function POST(_: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const { membershipId } = await context.params;
    const member = await session.family.approve(session.userId, pathParam(membershipId));
    const response = NextResponse.json(member);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
