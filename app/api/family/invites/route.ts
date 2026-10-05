import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const result = await session.family.createInvite(session.userId, session.householdId);
    const response = NextResponse.json({
      invite: {
        id: result.invite.id,
        householdId: result.invite.householdId,
        createdByUserId: result.invite.createdByUserId,
        expiresAt: result.invite.expiresAt,
        redeemedAt: result.invite.redeemedAt,
        revokedAt: result.invite.revokedAt,
      },
      plaintextCode: result.plaintextCode,
    }, { status: 201 });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
