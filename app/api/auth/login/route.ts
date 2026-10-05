import { NextResponse } from "next/server";
import { createServices } from "@/lib/server/auth";
import { parseJson, parseLogin, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const input = parseLogin(await parseJson(request));
    const result = await createServices().auth.login(input.email, input.password);
    const response = NextResponse.json(result.state);
    await setSessionCookie(response, result.sessionId, result.state.user.id);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
