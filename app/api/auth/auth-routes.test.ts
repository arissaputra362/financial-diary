import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, createServices, type AuthenticatedContext } from "@/lib/server/auth";
import { badRequest, unauthorized } from "@/lib/server/errors";
import type { AuthStateDTO } from "@/lib/server/services/auth";
import { POST as loginPost } from "./login/route";
import { POST as logoutPost } from "./logout/route";
import { GET as meGet } from "./me/route";
import { POST as signupPost } from "./signup/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const STATE: AuthStateDTO = {
  user: { id: "u1", email: "ana@example.com", displayName: "Ana" },
  household: { id: "h1", name: "Keluarga Ana" },
  role: "OWNER",
  status: "APPROVED",
  nextAction: "OPEN_HOME",
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(overrides: Partial<AuthenticatedContext> = {}): AuthenticatedContext {
  return {
    state: STATE,
    userId: "u1",
    householdId: "h1",
    role: "OWNER",
    sessionId: "sid-1",
    auth: { logout: vi.fn() } as unknown as AuthenticatedContext["auth"],
    family: {} as unknown as AuthenticatedContext["family"],
    transactions: {} as unknown as AuthenticatedContext["transactions"],
    ocr: {} as unknown as AuthenticatedContext["ocr"],
    dashboard: {} as AuthenticatedContext["dashboard"],
    reports: {} as AuthenticatedContext["reports"],
    budget: {} as AuthenticatedContext["budget"],
    goals: {} as AuthenticatedContext["goals"],
    wallets: {} as AuthenticatedContext["wallets"],
    institutions: {} as AuthenticatedContext["institutions"],
    advisor: {} as AuthenticatedContext["advisor"],
    ...overrides,
  };
}

describe("POST /api/auth/signup", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-please-change";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the AuthStateDTO + session cookie on owner bootstrap", async () => {
    const signup = vi.fn().mockResolvedValue({ state: STATE, sessionId: "sid-1" });
    vi.mocked(createServices).mockReturnValue({ auth: { signup }, family: {} } as unknown as ReturnType<typeof createServices>);

    const response = await signupPost(jsonRequest("/api/auth/signup", {
      email: "ana@example.com",
      displayName: "Ana",
      password: "password123",
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ nextAction: "OPEN_HOME", role: "OWNER" });
    const cookie = (response.headers.get("set-cookie") ?? "").toLowerCase();
    expect(cookie).toContain("financial_planner_session=");
    expect(cookie).toContain("httponly");
    expect(cookie).toContain("samesite=lax");
  });

  it("returns 422 with field errors for a short password and never calls the service", async () => {
    const response = await signupPost(jsonRequest("/api/auth/signup", {
      email: "ana@example.com",
      displayName: "Ana",
      password: "short",
    }));

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; fieldErrors: Record<string, string[]> } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fieldErrors.password?.[0]).toBe("Kata sandi minimal 8 karakter.");
    expect(createServices).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_INVITE with the identical body", async () => {
    const signup = vi.fn().mockRejectedValue(badRequest("INVALID_INVITE", "Kode undangan tidak valid atau sudah kedaluwarsa."));
    vi.mocked(createServices).mockReturnValue({ auth: { signup }, family: {} } as unknown as ReturnType<typeof createServices>);

    const response = await signupPost(jsonRequest("/api/auth/signup", {
      email: "bob@example.com",
      displayName: "Bob",
      password: "password123",
      inviteCode: "NOPE",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_INVITE",
        message: "Kode undangan tidak valid atau sudah kedaluwarsa.",
        fieldErrors: null,
      },
    });
  });
});

describe("POST /api/auth/login", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-please-change";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 + session cookie", async () => {
    const login = vi.fn().mockResolvedValue({ state: STATE, sessionId: "sid-2" });
    vi.mocked(createServices).mockReturnValue({ auth: { login }, family: {} } as unknown as ReturnType<typeof createServices>);

    const response = await loginPost(jsonRequest("/api/auth/login", { email: "ana@example.com", password: "password123" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "APPROVED" });
    expect(response.headers.get("set-cookie") ?? "").toContain("financial_planner_session=");
  });

  it("returns 401 UNAUTHORIZED for bad credentials", async () => {
    const login = vi.fn().mockRejectedValue(unauthorized("Email atau kata sandi salah."));
    vi.mocked(createServices).mockReturnValue({ auth: { login }, family: {} } as unknown as ReturnType<typeof createServices>);

    const response = await loginPost(jsonRequest("/api/auth/login", { email: "ana@example.com", password: "wrong" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });
});

describe("GET /api/auth/me", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-please-change";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a PENDING member and reissues the sliding cookie", async () => {
    const logout = vi.fn();
    vi.mocked(authenticatedRequest).mockResolvedValue(
      context({ state: { ...STATE, role: "MEMBER", status: "PENDING", nextAction: "WAIT_FOR_APPROVAL" }, auth: { logout } as unknown as AuthenticatedContext["auth"] }),
    );

    const response = await meGet();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "PENDING", role: "MEMBER" });
    expect(response.headers.get("set-cookie") ?? "").toContain("financial_planner_session=");
  });

  it("returns 401 when the session is not valid", async () => {
    vi.mocked(authenticatedRequest).mockRejectedValue(unauthorized());
    const response = await meGet();
    expect(response.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes the DB session and clears the cookie", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    vi.mocked(authenticatedRequest).mockResolvedValue(context({ auth: { logout } as unknown as AuthenticatedContext["auth"] }));

    const response = await logoutPost();

    expect(response.status).toBe(204);
    expect(logout).toHaveBeenCalledWith("sid-1");
    const cookie = (response.headers.get("set-cookie") ?? "").toLowerCase();
    expect(cookie).toContain("financial_planner_session=");
    expect(cookie).toContain("max-age=0");
  });

});

