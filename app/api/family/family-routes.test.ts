import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import { forbidden } from "@/lib/server/errors";
import { GET as membersGet } from "./members/route";
import { POST as invitesPost } from "./invites/route";
import { POST as approvePost } from "./members/[membershipId]/approve/route";
import { POST as declinePost } from "./members/[membershipId]/decline/route";
import { POST as revokePost } from "./members/[membershipId]/revoke/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const MEMBER = {
  id: "m2",
  householdId: "h1",
  userId: "u2",
  role: "MEMBER",
  status: "PENDING",
  user: { id: "u2", displayName: "Bob", email: "bob@example.com" },
  invitedByUserId: "u1",
  inviteId: "inv1",
  requestedAt: null,
  approvedAt: null,
  declinedAt: null,
  revokedAt: null,
  decisionReason: null,
};

type FamilyMock = {
  listMembers: ReturnType<typeof vi.fn>;
  createInvite: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
  decline: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
};

function context(family: FamilyMock): AuthenticatedContext {
  return {
    state: {
      user: { id: "u1", email: "owner@example.com", displayName: "Owner" },
      household: { id: "h1", name: "Keluarga" },
      role: "OWNER",
      status: "APPROVED",
      nextAction: "OPEN_HOME",
    },
    userId: "u1",
    householdId: "h1",
    role: "OWNER",
    sessionId: "sid-1",
    auth: {} as unknown as AuthenticatedContext["auth"],
    family: family as unknown as AuthenticatedContext["family"],
    transactions: {} as unknown as AuthenticatedContext["transactions"],
    ocr: {} as unknown as AuthenticatedContext["ocr"],
    dashboard: {} as AuthenticatedContext["dashboard"],
    reports: {} as AuthenticatedContext["reports"],
    budget: {} as AuthenticatedContext["budget"],
    goals: {} as AuthenticatedContext["goals"],
    wallets: {} as AuthenticatedContext["wallets"],
    institutions: {} as AuthenticatedContext["institutions"],
    advisor: {} as AuthenticatedContext["advisor"],
  };
}

const params = (membershipId: string) => ({ params: Promise.resolve({ membershipId }) });

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/family", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/family/members", () => {
  it("returns the member array and reissues the sliding cookie", async () => {
    const family: FamilyMock = {
      listMembers: vi.fn().mockResolvedValue([MEMBER]),
      createInvite: vi.fn(),
      approve: vi.fn(),
      decline: vi.fn(),
      revoke: vi.fn(),
    };
    vi.mocked(authenticatedRequest).mockResolvedValue(context(family));

    const response = await membersGet();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([MEMBER]);
    expect(response.headers.get("set-cookie") ?? "").toContain("financial_planner_session=");
  });

  it("maps a PENDING member to a typed 403 ACCESS_PENDING", async () => {
    vi.mocked(authenticatedRequest).mockRejectedValue(
      forbidden("ACCESS_PENDING", "Akun Anda belum memiliki akses ke data keluarga."),
    );
    const response = await membersGet();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCESS_PENDING" } });
  });
});

describe("POST /api/family/invites", () => {
  it("returns the one-time plaintext code with 201", async () => {
    const family: FamilyMock = {
      listMembers: vi.fn(),
      createInvite: vi.fn().mockResolvedValue({
        invite: {
          id: "inv1",
          householdId: "h1",
          createdByUserId: "u1",
          expiresAt: new Date("2026-10-08T00:00:00Z"),
          redeemedAt: null,
          revokedAt: null,
        },
        plaintextCode: "ABCD1234",
      }),
      approve: vi.fn(),
      decline: vi.fn(),
      revoke: vi.fn(),
    };
    vi.mocked(authenticatedRequest).mockResolvedValue(context(family));

    const response = await invitesPost();
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ plaintextCode: "ABCD1234" });
    expect(family.createInvite).toHaveBeenCalledWith("u1", "h1");
  });
});

describe("member decisions", () => {
  function familyWith(overrides: Partial<FamilyMock>): FamilyMock {
    return {
      listMembers: vi.fn(),
      createInvite: vi.fn(),
      approve: vi.fn(),
      decline: vi.fn(),
      revoke: vi.fn(),
      ...overrides,
    };
  }

  it("approves and appends via the service", async () => {
    const family = familyWith({ approve: vi.fn().mockResolvedValue({ ...MEMBER, status: "APPROVED" }) });
    vi.mocked(authenticatedRequest).mockResolvedValue(context(family));

    const response = await approvePost(new Request("http://localhost/x", { method: "POST" }), params("m2"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "APPROVED" });
    expect(family.approve).toHaveBeenCalledWith("u1", "m2");
  });

  it("declines with the parsed reason", async () => {
    const family = familyWith({ decline: vi.fn().mockResolvedValue({ ...MEMBER, status: "DECLINED" }) });
    vi.mocked(authenticatedRequest).mockResolvedValue(context(family));

    const response = await declinePost(jsonRequest({ reason: "Bukan anggota keluarga" }), params("m2"));
    expect(response.status).toBe(200);
    expect(family.decline).toHaveBeenCalledWith("u1", "m2", "Bukan anggota keluarga");
  });

  it("revokes with the parsed reason", async () => {
    const family = familyWith({ revoke: vi.fn().mockResolvedValue({ ...MEMBER, status: "REVOKED" }) });
    vi.mocked(authenticatedRequest).mockResolvedValue(context(family));

    const response = await revokePost(jsonRequest({ reason: "Pindah rumah" }), params("m2"));
    expect(response.status).toBe(200);
    expect(family.revoke).toHaveBeenCalledWith("u1", "m2", "Pindah rumah");
  });

  it("rejects a reason longer than 200 characters with 422", async () => {
    const family = familyWith({ decline: vi.fn() });
    vi.mocked(authenticatedRequest).mockResolvedValue(context(family));

    const response = await declinePost(jsonRequest({ reason: "x".repeat(201) }), params("m2"));
    expect(response.status).toBe(422);
    expect(family.decline).not.toHaveBeenCalled();
  });
});

