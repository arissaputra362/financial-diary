/*
  FamilyService (feat-auth-approval, ADR-004, ADR-006).

  Owner-only household administration: create invites, list members, and drive
  the PENDING→APPROVED / PENDING→DECLINED / APPROVED→REVOKED transitions. Every
  decision appends an immutable membership_event for audit (AC-F1-5).
*/

import { createHash, randomBytes } from "node:crypto";
import { conflict, forbidden, notFound } from "../errors";
import type { AuthRepositories } from "./auth";

/* ── Types ──────────────────────────────────────────────────────── */

export type MembershipDTO = {
  id: string;
  householdId: string;
  userId: string;
  role: string;
  status: string;
  user: { id: string; displayName: string; email: string } | null;
  invitedByUserId: string | null;
  inviteId: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  revokedAt: string | null;
  decisionReason: string | null;
};

export type CreateInviteOutput = {
  invite: {
    id: string;
    householdId: string;
    createdByUserId: string;
    expiresAt: Date;
    redeemedAt: Date | null;
    revokedAt: Date | null;
  };
  /** Shown to the Owner exactly once; only the SHA-256 hash is persisted. */
  plaintextCode: string;
};

type DecisionStatus = "APPROVED" | "DECLINED" | "REVOKED";

/* ── Service ────────────────────────────────────────────────────── */

export class FamilyService {
  constructor(private readonly repos: AuthRepositories) {}

  async createInvite(actorUserId: string, householdId: string): Promise<CreateInviteOutput> {
    await this.requireOwner(actorUserId, householdId);

    const plaintextCode = this.generateInviteCode();
    const invite = await this.repos.invite.create({
      householdId,
      codeHash: this.sha256(plaintextCode),
      createdByUserId: actorUserId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return {
      invite: {
        id: invite.id,
        householdId: invite.householdId,
        createdByUserId: invite.createdByUserId,
        expiresAt: invite.expiresAt,
        redeemedAt: invite.redeemedAt,
        revokedAt: invite.revokedAt,
      },
      plaintextCode,
    };
  }

  async listMembers(actorUserId: string, householdId: string): Promise<MembershipDTO[]> {
    const membership = await this.repos.membership.findByUserAndHousehold(actorUserId, householdId);
    if (!membership || membership.status !== "APPROVED") {
      throw forbidden("ACCESS_DENIED", "Anda bukan anggota keluarga ini.");
    }
    const members = await this.repos.membership.listByHousehold(householdId);
    return members.map((m) => this.toDTO(m));
  }

  async approve(actorUserId: string, membershipId: string, reason?: string): Promise<MembershipDTO> {
    return this.transition(actorUserId, membershipId, "APPROVED", reason);
  }

  async decline(actorUserId: string, membershipId: string, reason?: string): Promise<MembershipDTO> {
    return this.transition(actorUserId, membershipId, "DECLINED", reason);
  }

  async revoke(actorUserId: string, membershipId: string, reason?: string): Promise<MembershipDTO> {
    return this.transition(actorUserId, membershipId, "REVOKED", reason);
  }

  /* ── private ──────────────────────────────────────────────────── */

  private async transition(
    actorUserId: string,
    membershipId: string,
    nextStatus: DecisionStatus,
    reason?: string,
  ): Promise<MembershipDTO> {
    const target = await this.repos.membership.findById(membershipId);
    if (!target) throw notFound("Anggota tidak ditemukan.");

    await this.requireOwner(actorUserId, target.householdId);

    // An OWNER row is never a valid target (includes an owner revoking self).
    if (target.role === "OWNER") {
      throw conflict("INVALID_STATE_TRANSITION", "Status anggota tidak dapat diubah.");
    }

    /*
      Allowed transitions (AC-F1-5): PENDING→APPROVED, PENDING→DECLINED,
      APPROVED→REVOKED. Anything else is rejected without an audit event.
    */
    const allowed =
      (nextStatus === "APPROVED" && target.status === "PENDING") ||
      (nextStatus === "DECLINED" && target.status === "PENDING") ||
      (nextStatus === "REVOKED" && target.status === "APPROVED");
    if (!allowed) {
      throw conflict("INVALID_STATE_TRANSITION", "Status anggota tidak dapat diubah.");
    }

    const now = new Date();
    const patch =
      nextStatus === "APPROVED"
        ? { status: nextStatus, approvedAt: now, approvedByUserId: actorUserId, decisionReason: reason ?? null }
        : nextStatus === "DECLINED"
          ? { status: nextStatus, declinedAt: now, declinedByUserId: actorUserId, decisionReason: reason ?? null }
          : { status: nextStatus, revokedAt: now, revokedByUserId: actorUserId, decisionReason: reason ?? null };

    const updated = await this.repos.membership.updateStatus(target.householdId, membershipId, patch);
    if (!updated) throw notFound("Anggota tidak ditemukan.");

    await this.repos.membershipEvent.append({
      membershipId,
      householdId: target.householdId,
      actorUserId,
      eventType: nextStatus,
      previousStatus: target.status as "PENDING" | "APPROVED" | "DECLINED" | "REVOKED",
      nextStatus,
      reason: reason ?? null,
    });

    return this.toDTO(updated);
  }

  private async requireOwner(actorUserId: string, householdId: string): Promise<void> {
    const actor = await this.repos.membership.findByUserAndHousehold(actorUserId, householdId);
    if (!actor || actor.role !== "OWNER" || actor.status !== "APPROVED") {
      throw forbidden("ACCESS_DENIED", "Hanya pemilik keluarga yang dapat melakukan tindakan ini.");
    }
  }

  private toDTO(membership: {
    id: string;
    householdId: string;
    userId: string;
    role: string;
    status: string;
    invitedByUserId: string | null;
    inviteId: string | null;
    requestedAt: Date | null;
    approvedAt: Date | null;
    declinedAt: Date | null;
    revokedAt: Date | null;
    decisionReason: string | null;
    user?: { id: string; displayName: string; email: string } | null;
  }): MembershipDTO {
    return {
      id: membership.id,
      householdId: membership.householdId,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
      user: membership.user ?? null,
      invitedByUserId: membership.invitedByUserId,
      inviteId: membership.inviteId,
      requestedAt: membership.requestedAt?.toISOString() ?? null,
      approvedAt: membership.approvedAt?.toISOString() ?? null,
      declinedAt: membership.declinedAt?.toISOString() ?? null,
      revokedAt: membership.revokedAt?.toISOString() ?? null,
      decisionReason: membership.decisionReason,
    };
  }

  private generateInviteCode(): string {
    // Crockford-style alphabet: no ambiguous 0/O/1/I, uppercase-only, 8 chars.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(8);
    let code = "";
    for (let i = 0; i < 8; i += 1) code += alphabet[bytes[i] % alphabet.length];
    return code;
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}
