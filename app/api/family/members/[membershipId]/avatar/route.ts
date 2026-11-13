import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { createVercelBlobStore } from "@/lib/server/providers/blob";
import { getPresetAvatarSvg } from "@/app/api/profile/avatar/route";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ membershipId: string }> },
): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const { membershipId } = await context.params;
    const members = await session.family.listMembers(session.userId, session.householdId);
    const member = members.find((candidate) => candidate.id === membershipId);
    if (!member?.user?.avatarUrl) return new NextResponse(null, { status: 404 });

    const avatar = await session.auth.getAvatar(member.userId);
    if (!avatar) return new NextResponse(null, { status: 404 });
    if (avatar.avatarKey.startsWith("preset:")) {
      const svg = getPresetAvatarSvg(avatar.avatarKey.slice("preset:".length));
      if (!svg) return new NextResponse(null, { status: 404 });
      return new NextResponse(svg, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=300" },
      });
    }

    const stored = await createVercelBlobStore().get(avatar.avatarKey);
    if (!stored) return new NextResponse(null, { status: 404 });
    const response = new NextResponse(stored.stream);
    response.headers.set("Content-Type", avatar.avatarContentType);
    response.headers.set("Cache-Control", "private, max-age=300");
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
