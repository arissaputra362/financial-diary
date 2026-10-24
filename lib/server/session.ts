/*
  Session token + cookie helpers (ADR-002). Edge-safe: this module only uses
  `jose` and the Web Crypto API, so `proxy.ts` can verify a token without
  touching the database.

  Claims are `{ sub, sid, token_version, remember, iat, exp }` (A-04). Role and
  household_id are deliberately absent; they are read from the DB per request.
*/

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unauthorized } from "./errors";

export const SESSION_COOKIE = "financial_planner_session";
/** Sliding JWT lifetime; the DB session carries the absolute 7-day expiry. */
export const SESSION_TTL_SECONDS = 15 * 60;
export const REMEMBERED_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type SessionClaims = {
  sub: string;
  sid: string;
  token_version: string;
  remember?: boolean;
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
    (payload.remember === undefined || typeof payload.remember === "boolean") &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number"
  );
}

export async function signSession(
  sessionId: string,
  userId: string,
  rememberSession = false,
): Promise<string> {
  const ttl = rememberSession ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  return new SignJWT({
    sub: userId,
    sid: sessionId,
    token_version: "v1",
    remember: rememberSession,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
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
  rememberSession?: boolean,
): Promise<void> {
  const persistent =
    rememberSession ?? (await getRememberedSessionFromRequest());
  const maxAge = persistent ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  response.cookies.set(SESSION_COOKIE, await signSession(sessionId, userId, persistent), {
    ...cookieOptions,
    maxAge,
  });
}

async function getRememberedSessionFromRequest(): Promise<boolean> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return false;
    return (await verifySession(token)).remember === true;
  } catch {
    return false;
  }
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
