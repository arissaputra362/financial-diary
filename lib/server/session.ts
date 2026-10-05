/*
  Session token + cookie helpers (ADR-002). Edge-safe: this module only uses
  `jose` and the Web Crypto API, so `proxy.ts` can verify a token without
  touching the database.

  Claims are exactly `{ sub, sid, token_version, iat, exp }` (A-04). Role and
  household_id are deliberately absent; they are read from the DB per request.
*/

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { NextResponse } from "next/server";
import { unauthorized } from "./errors";

export const SESSION_COOKIE = "financial_planner_session";
/** Sliding JWT lifetime; the DB session carries the absolute 7-day expiry. */
export const SESSION_TTL_SECONDS = 15 * 60;

export type SessionClaims = {
  sub: string;
  sid: string;
  token_version: string;
  iat: number;
  exp: number;
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

function isSessionClaims(payload: JWTPayload): payload is JWTPayload & SessionClaims {
  return (
    typeof payload.sub === "string" &&
    typeof payload.sid === "string" &&
    payload.token_version === "v1" &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number"
  );
}

export async function signSession(sessionId: string, userId: string): Promise<string> {
  return new SignJWT({ sub: userId, sid: sessionId, token_version: "v1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!isSessionClaims(payload)) throw unauthorized();
    return payload;
  } catch {
    throw unauthorized();
  }
}

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export async function setSessionCookie(
  response: NextResponse,
  sessionId: string,
  userId: string,
): Promise<void> {
  response.cookies.set(SESSION_COOKIE, await signSession(sessionId, userId), {
    ...cookieOptions,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
