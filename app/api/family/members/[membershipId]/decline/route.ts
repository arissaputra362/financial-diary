import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseDecision, parseJson, pathParam, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ membershipId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const { membershipId } = await context.params;
    const input = parseDecision(await parseJson(request));
    const member = await session.family.decline(session.userId, pathParam(membershipId), input.reason);
    const response = NextResponse.json(member);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
