import { beforeAll, describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import { NextResponse } from "next/server";
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie, signSession, verifySession } from "./session";

describe("session token + cookie (ADR-002)", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-please-change";
  });

  it("signs claims = {sub,sid,token_version,iat,exp} with no role or household_id", async () => {
    const token = await signSession("sid-1", "u1");
    const payload = decodeJwt(token);

    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sid", "sub", "token_version"]);
    expect(payload).toMatchObject({ sub: "u1", sid: "sid-1", token_version: "v1" });
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("household_id");

    const verified = await verifySession(token);
    expect(verified.sid).toBe("sid-1");
  });

  it("rejects a tampered token with 401", async () => {
    const token = await signSession("sid-1", "u1");
    await expect(verifySession(`${token}tampered`)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  });

  it("sets an HttpOnly/Secure/SameSite=Lax cookie", async () => {
    const response = NextResponse.json({ ok: true });
    await setSessionCookie(response, "sid-1", "u1");

    const setCookie = (response.headers.get("set-cookie") ?? "").toLowerCase();
    expect(setCookie).toContain("financial_planner_session=");
    expect(setCookie).toContain("httponly");
    expect(setCookie).toContain("secure");
    expect(setCookie).toContain("samesite=lax");
    expect(setCookie).toContain("path=/");
  });

  it("clears the cookie with Max-Age=0", () => {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    const setCookie = (response.headers.get("set-cookie") ?? "").toLowerCase();
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain("max-age=0");
  });
});
