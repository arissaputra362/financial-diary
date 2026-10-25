import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { MembershipRecord } from "../repositories/auth";
import { FamilyService } from "./family";
import type { AuthRepositories } from "./auth";

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

function buildFamily() {
  const repos = {
    user: { findByEmail: vi.fn(), create: vi.fn(), findById: vi.fn() },
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
  const service = new FamilyService(repos as unknown as AuthRepositories);
  return { service, repos };
}

const OWNER_ACTOR = membership({ id: "m-owner", userId: "owner1", role: "OWNER", status: "APPROVED" });

/* ── createInvite ───────────────────────────────────────────────── */

describe("FamilyService.createInvite", () => {
  it("stores only the SHA-256 hash and returns the plaintext code once", async () => {
    const { service, repos } = buildFamily();
    repos.membership.findByUserAndHousehold.mockResolvedValue(OWNER_ACTOR);
    repos.invite.create.mockImplementation(async (data: { codeHash: string }) => ({
      id: "inv1",
      householdId: "h1",
      codeHash: data.codeHash,
      createdByUserId: "owner1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      redeemedAt: null,
      revokedAt: null,
    }));

    const result = await service.createInvite("owner1", "h1");

    expect(result.plaintextCode).toMatch(/^[A-Z0-9]{8}$/);
    const stored = repos.invite.create.mock.calls[0]?.[0] as { codeHash: string };
    expect(stored.codeHash).toBe(createHash("sha256").update(result.plaintextCode, "utf8").digest("hex"));
    expect(stored.codeHash).not.toBe(result.plaintextCode);
    expect(result.invite).not.toHaveProperty("codeHash");
  });

  it("rejects a non-owner with 403", async () => {
    const { service, repos } = buildFamily();
    repos.membership.findByUserAndHousehold.mockResolvedValue(membership({ role: "MEMBER", status: "APPROVED" }));
    await expect(service.createInvite("u1", "h1")).rejects.toMatchObject({ code: "ACCESS_DENIED", statusCode: 403 });
    expect(repos.invite.create).not.toHaveBeenCalled();
  });
});

/* ── listMembers ────────────────────────────────────────────────── */

describe("FamilyService.listMembers", () => {
  it("returns members with their joined user profile", async () => {
    const { service, repos } = buildFamily();
    repos.membership.findByUserAndHousehold.mockResolvedValue(OWNER_ACTOR);
    repos.membership.listByHousehold.mockResolvedValue([
      membership({
        id: "m2",
        userId: "u2",
        role: "MEMBER",
        status: "APPROVED",
        user: { id: "u2", displayName: "Bob", email: "bob@example.com" },
      }),
    ]);

    const members = await service.listMembers("owner1", "h1");
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ user: { displayName: "Bob" }, status: "APPROVED" });
  });

  it("rejects a non-approved caller with 403", async () => {
    const { service, repos } = buildFamily();
    repos.membership.findByUserAndHousehold.mockResolvedValue(membership({ status: "PENDING" }));
    await expect(service.listMembers("u1", "h1")).rejects.toMatchObject({ code: "ACCESS_DENIED", statusCode: 403 });
  });
});

/* ── decisions + audit (AC-F1-5) ────────────────────────────────── */

describe("FamilyService decisions", () => {
  it("approves a PENDING member and appends exactly one APPROVED event", async () => {
    const { service, repos } = buildFamily();
    const target = membership({ id: "m2", userId: "u2", status: "PENDING" });
    repos.membership.findById.mockResolvedValue(target);
    repos.membership.findByUserAndHousehold.mockResolvedValue(OWNER_ACTOR);
    repos.membership.updateStatus.mockResolvedValue({ ...target, status: "APPROVED" });

    const result = await service.approve("owner1", "m2");

    expect(result.status).toBe("APPROVED");
    expect(repos.membershipEvent.append).toHaveBeenCalledTimes(1);
    expect(repos.membershipEvent.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "APPROVED", previousStatus: "PENDING", nextStatus: "APPROVED" }),
    );
  });

  it("declines a PENDING member and appends one DECLINED event", async () => {
    const { service, repos } = buildFamily();
    const target = membership({ id: "m2", userId: "u2", status: "PENDING" });
    repos.membership.findById.mockResolvedValue(target);
    repos.membership.findByUserAndHousehold.mockResolvedValue(OWNER_ACTOR);
    repos.membership.updateStatus.mockResolvedValue({ ...target, status: "DECLINED" });

    const result = await service.decline("owner1", "m2", "Kode tidak dikenal");
    expect(result.status).toBe("DECLINED");
    expect(repos.membershipEvent.append).toHaveBeenCalledTimes(1);
    expect(repos.membershipEvent.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "DECLINED", reason: "Kode tidak dikenal" }),
    );
  });

  it("revokes an APPROVED member (APPROVED→REVOKED)", async () => {
    const { service, repos } = buildFamily();
    const target = membership({ id: "m2", userId: "u2", status: "APPROVED" });
    repos.membership.findById.mockResolvedValue(target);
    repos.membership.findByUserAndHousehold.mockResolvedValue(OWNER_ACTOR);
    repos.membership.updateStatus.mockResolvedValue({ ...target, status: "REVOKED" });

    const result = await service.revoke("owner1", "m2");
    expect(result.status).toBe("REVOKED");
    expect(repos.membershipEvent.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "REVOKED", previousStatus: "APPROVED" }),
    );
  });

  it("rejects a non-owner with 403", async () => {
    const { service, repos } = buildFamily();
    repos.membership.findById.mockResolvedValue(membership({ id: "m2", status: "PENDING" }));
    repos.membership.findByUserAndHousehold.mockResolvedValue(membership({ userId: "u9", role: "MEMBER", status: "APPROVED" }));
    await expect(service.approve("u9", "m2")).rejects.toMatchObject({ code: "ACCESS_DENIED", statusCode: 403 });
    expect(repos.membership.updateStatus).not.toHaveBeenCalled();
  });

  it("refuses to decline or revoke an OWNER membership with 409 and no event", async () => {
    const { service, repos } = buildFamily();
    repos.membership.findById.mockResolvedValue(membership({ id: "m-owner", role: "OWNER", status: "APPROVED" }));
    repos.membership.findByUserAndHousehold.mockResolvedValue(OWNER_ACTOR);

    await expect(service.decline("owner1", "m-owner")).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
      statusCode: 409,
    });
    await expect(service.revoke("owner1", "m-owner")).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
      statusCode: 409,
    });
    expect(repos.membership.updateStatus).not.toHaveBeenCalled();
    expect(repos.membershipEvent.append).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition (DECLINED→APPROVED) with 409", async () => {
    const { service, repos } = buildFamily();
    repos.membership.findById.mockResolvedValue(membership({ id: "m2", status: "DECLINED" }));
    repos.membership.findByUserAndHousehold.mockResolvedValue(OWNER_ACTOR);
    await expect(service.approve("owner1", "m2")).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
      statusCode: 409,
    });
    expect(repos.membershipEvent.append).not.toHaveBeenCalled();
  });

  it("maps a cross-household update (rowcount 0) to 404", async () => {
    const { service, repos } = buildFamily();
    repos.membership.findById.mockResolvedValue(membership({ id: "m2", status: "PENDING" }));
    repos.membership.findByUserAndHousehold.mockResolvedValue(OWNER_ACTOR);
    repos.membership.updateStatus.mockResolvedValue(null);
    await expect(service.approve("owner1", "m2")).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
  });
});
