import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/server/session";

/*
  Edge proxy (Next.js 16, formerly middleware). Optimistic gate only: it verifies
  the JWT signature and `exp`, with no database access. Full session + membership
  revalidation still happens in the Node route handlers, which also reissue the
  sliding cookie (ADR-002).
*/

const PUBLIC_API_ROUTES = new Set(["/api/auth/signup", "/api/auth/login"]);
function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Silakan masuk kembali.", fieldErrors: null } },
    { status: 401 },
  );
}

function isApiRequest(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  if (isApiRequest(request) && PUBLIC_API_ROUTES.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return isApiRequest(request)
      ? unauthorizedResponse()
      : NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await verifySession(token);
    return NextResponse.next();
  } catch {
    return isApiRequest(request)
      ? unauthorizedResponse()
      : NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/api/:path*",
    "/home",
    "/budget",
    "/transactions",
    "/family",
    "/profile",
    "/waiting-for-approval",
  ],
};
