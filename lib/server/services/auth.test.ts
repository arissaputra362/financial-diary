import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { signupSchema } from "../contracts/auth";
import { accessDeniedForStatus } from "../errors";
import type { MembershipRecord } from "../repositories/auth";
import { AuthService, type AuthRepositories } from "./auth";

/* ── Test doubles ───────────────────────────────────────────────── */

function membership(overrides: Partial<MembershipRecord> = {}): MembershipRecord {
  return {
    id: "m1",
    householdId: "h1",
    userId: "u1",
    role: "MEMBER",
    status: "PENDING",
    invitedByUserId: null,
    inviteId: null,
    requestedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    declinedAt: null,
    declinedByUserId: null,
    revokedAt: null,
    revokedByUserId: null,
    decisionReason: null,
    ...overrides,
  };
}

function buildAuth(transactionOverride?: <T>(fn: (repos: AuthRepositories) => Promise<T>) => Promise<T>) {
  const repos = {
    user: { findByEmail: vi.fn(), create: vi.fn(), findById: vi.fn(), findCredentialsById: vi.fn(), updateDisplayName: vi.fn(), updatePasswordHash: vi.fn() },
    household: { create: vi.fn(), findById: vi.fn() },
    membership: {
      findActiveByUserId: vi.fn(),
      findLatestByUserId: vi.fn(),
      findByUserAndHousehold: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      listByHousehold: vi.fn(),
    },
    invite: { create: vi.fn(), findByCodeHash: vi.fn(), redeemConditional: vi.fn(), revoke: vi.fn() },
    session: { create: vi.fn(), findActiveById: vi.fn(), touch: vi.fn(), revoke: vi.fn(), revokeOthers: vi.fn(), purgeExpired: vi.fn() },
    membershipEvent: { append: vi.fn() },
  };
  const bundle = repos as unknown as AuthRepositories;
  const transaction =
    transactionOverride ?? (<T>(fn: (r: AuthRepositories) => Promise<T>) => fn(bundle));
  return { service: new AuthService(bundle, transaction), repos };
}

const USER = { id: "u1", email: "ana@example.com", displayName: "Ana", passwordHash: "" };
const HOUSEHOLD = { id: "h1", name: "Keluarga Ana", ownerUserId: "u1" };

/* ── AC-F1-1: owner bootstrap ───────────────────────────────────── */

describe("AuthService.signup (owner bootstrap)", () => {
  it("creates user + household + OWNER membership in one transaction and returns OPEN_HOME", async () => {
    const { repos } = buildAuth();
    const txSpy = vi.fn();
    const transaction = <T>(fn: (r: AuthRepositories) => Promise<T>): Promise<T> => {
      txSpy();
      return fn(repos as unknown as AuthRepositories);
    };
    const svc = new AuthService(repos as unknown as AuthRepositories, transaction);

    repos.user.findByEmail.mockResolvedValue(null);
    repos.user.create.mockResolvedValue({ id: "u1", email: USER.email, displayName: "Ana" });
    repos.household.create.mockResolvedValue(HOUSEHOLD);
    repos.membership.create.mockResolvedValue(membership({ role: "OWNER", status: "APPROVED" }));
    repos.session.create.mockResolvedValue(undefined);

    const result = await svc.signup({ email: USER.email, displayName: "Ana", password: "password123" });

    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(repos.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: USER.email, displayName: "Ana" }),
    );
    expect(repos.household.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: "u1" }),
    );
    expect(repos.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: "OWNER", status: "APPROVED" }),
    );
    expect(repos.membershipEvent.append).toHaveBeenCalledTimes(1);
    expect(repos.membershipEvent.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "APPROVED", nextStatus: "APPROVED", actorUserId: "u1" }),
    );
    expect(repos.session.create).toHaveBeenCalledTimes(1);
    expect(result.state).toMatchObject({ role: "OWNER", status: "APPROVED", nextAction: "OPEN_HOME" });
  });

  it("rejects password shorter than 8 with a plain-language field error", () => {
    const parsed = signupSchema.safeParse({ email: "ana@example.com", displayName: "Ana", password: "short" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Kata sandi minimal 8 karakter.");
    }
  });

  it("rejects a duplicate email with 409 EMAIL_TAKEN", async () => {
    const { service, repos } = buildAuth();
    repos.user.findByEmail.mockResolvedValue(USER);
    await expect(
      service.signup({ email: USER.email, displayName: "Ana", password: "password123" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN", statusCode: 409 });
  });
});

/* ── AC-F1-2/3: invite redeem ───────────────────────────────────── */

describe("AuthService.signup (invite)", () => {
  function invite(overrides: Record<string, unknown> = {}) {
    return {
      id: "inv1",
      householdId: "h1",
      createdByUserId: "owner1",
      expiresAt: new Date(Date.now() + 60_000),
      redeemedAt: null,
      revokedAt: null,
      ...overrides,
    };
  }

  it("redeems a valid invite and creates a PENDING membership + REQUESTED event", async () => {
    const { service, repos } = buildAuth();
    repos.user.findByEmail.mockResolvedValue(null);
    repos.invite.findByCodeHash.mockResolvedValue(invite());
    repos.user.create.mockResolvedValue({ id: "u2", email: "bob@example.com", displayName: "Bob" });
    repos.invite.redeemConditional.mockResolvedValue(1);
    repos.membership.create.mockResolvedValue(membership({ userId: "u2", role: "MEMBER", status: "PENDING" }));
    repos.household.findById.mockResolvedValue(HOUSEHOLD);
    repos.session.create.mockResolvedValue(undefined);

    const result = await service.signup({
      email: "bob@example.com",
      displayName: "Bob",
      password: "password123",
      inviteCode: "ABCD1234",
    });

    expect(repos.invite.redeemConditional).toHaveBeenCalledWith("inv1", "u2");
    expect(repos.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: "MEMBER", status: "PENDING", inviteId: "inv1" }),
    );
    expect(repos.membershipEvent.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "REQUESTED", nextStatus: "PENDING" }),
    );
    expect(result.state).toMatchObject({ status: "PENDING", nextAction: "WAIT_FOR_APPROVAL" });
  });

  it("returns identical INVALID_INVITE for wrong, expired, revoked and redeemed codes", async () => {
    const causes = [
      null,
      invite({ redeemedAt: new Date() }),
      invite({ revokedAt: new Date() }),
      invite({ expiresAt: new Date(Date.now() - 1000) }),
    ];

    for (const found of causes) {
      const { service, repos } = buildAuth();
      repos.user.findByEmail.mockResolvedValue(null);
      repos.invite.findByCodeHash.mockResolvedValue(found);
      await expect(
        service.signup({ email: "bob@example.com", displayName: "Bob", password: "password123", inviteCode: "X" }),
      ).rejects.toMatchObject({
        code: "INVALID_INVITE",
        statusCode: 400,
        message: "Kode undangan tidak valid atau sudah kedaluwarsa.",
      });
      expect(repos.user.create).not.toHaveBeenCalled();
    }
  });

  it("treats a lost redeem race (rowcount 0) as INVALID_INVITE", async () => {
    const { service, repos } = buildAuth();
    repos.user.findByEmail.mockResolvedValue(null);
    repos.invite.findByCodeHash.mockResolvedValue(invite());
    repos.user.create.mockResolvedValue({ id: "u2", email: "bob@example.com", displayName: "Bob" });
    repos.invite.redeemConditional.mockResolvedValue(0);
    await expect(
      service.signup({ email: "bob@example.com", displayName: "Bob", password: "password123", inviteCode: "X" }),
    ).rejects.toMatchObject({ code: "INVALID_INVITE", statusCode: 400 });
  });
});

/* ── AC-F1-6: login / logout ────────────────────────────────────── */

describe("AuthService.login", () => {
  it("issues a new sid on every login (anti session fixation)", async () => {
    const { service, repos } = buildAuth();
    repos.user.findByEmail.mockResolvedValue({ ...USER, passwordHash: bcrypt.hashSync("password123", 4) });
    repos.membership.findLatestByUserId.mockResolvedValue(membership({ role: "OWNER", status: "APPROVED" }));
    repos.household.findById.mockResolvedValue(HOUSEHOLD);
    repos.session.create.mockResolvedValue(undefined);

    const first = await service.login(USER.email, "password123");
    const second = await service.login(USER.email, "password123");

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(repos.session.create).toHaveBeenCalledTimes(2);
    expect(repos.session.purgeExpired).toHaveBeenCalled();
  });

  it("returns one uniform 401 for an unknown email and for a wrong password", async () => {
    const { service, repos } = buildAuth();
    repos.user.findByEmail.mockResolvedValue(null);
    await expect(service.login("nobody@example.com", "password123")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });

    repos.user.findByEmail.mockResolvedValue({ ...USER, passwordHash: bcrypt.hashSync("correct-horse", 4) });
    await expect(service.login(USER.email, "wrong-password")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  });

  it("revokes only the given session on logout", async () => {
    const { service, repos } = buildAuth();
    repos.session.revoke.mockResolvedValue(undefined);
    await service.logout("sid-1");
    expect(repos.session.revoke).toHaveBeenCalledWith("sid-1");
  });
});

/* ── AC-F1-4/7: revalidation ────────────────────────────────────── */

describe("AuthService.revalidate", () => {
  it("returns ACCESS_PENDING for a PENDING membership and touches the session", async () => {
    const { service, repos } = buildAuth();
    repos.session.findActiveById.mockResolvedValue({
      id: "sid-1",
      userId: "u1",
      tokenVersion: "v1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    repos.user.findById.mockResolvedValue(USER);
    repos.membership.findLatestByUserId.mockResolvedValue(membership({ status: "PENDING" }));
    repos.household.findById.mockResolvedValue(HOUSEHOLD);

    const result = await service.revalidate("sid-1");

    expect(result.state.status).toBe("PENDING");
    expect(accessDeniedForStatus(result.state.status)?.code).toBe("ACCESS_PENDING");
    expect(repos.session.touch).toHaveBeenCalledWith("sid-1");
  });

  it("rejects a revoked or expired session with 401", async () => {
    const { service, repos } = buildAuth();
    repos.session.findActiveById.mockResolvedValue(null);
    await expect(service.revalidate("sid-1")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  });

  it("reflects a freshly approved membership on the next request", async () => {
    const { service, repos } = buildAuth();
    repos.session.findActiveById.mockResolvedValue({ id: "sid-1", userId: "u1", tokenVersion: "v1", expiresAt: new Date(Date.now() + 60_000) });
    repos.user.findById.mockResolvedValue(USER);
    repos.household.findById.mockResolvedValue(HOUSEHOLD);

    repos.membership.findLatestByUserId.mockResolvedValueOnce(membership({ status: "PENDING" }));
    const pending = await service.revalidate("sid-1");
    repos.membership.findLatestByUserId.mockResolvedValueOnce(membership({ status: "APPROVED" }));
    const approved = await service.revalidate("sid-1");

    expect(pending.state.nextAction).toBe("WAIT_FOR_APPROVAL");
    expect(approved.state.nextAction).toBe("OPEN_HOME");
  });
});

/* ── AC-F1-4: typed access errors ───────────────────────────────── */

describe("accessDeniedForStatus", () => {
  it("maps each non-approved status to its typed 403 and allows APPROVED", () => {
    expect(accessDeniedForStatus("PENDING")).toMatchObject({ code: "ACCESS_PENDING", statusCode: 403 });
    expect(accessDeniedForStatus("DECLINED")).toMatchObject({ code: "ACCESS_DECLINED", statusCode: 403 });
    expect(accessDeniedForStatus("REVOKED")).toMatchObject({ code: "ACCESS_REVOKED", statusCode: 403 });
    expect(accessDeniedForStatus("APPROVED")).toBeNull();
  });
});
