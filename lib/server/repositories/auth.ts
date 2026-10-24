import type { Db } from "./types";

/*
  Auth-domain repositories (feat-auth-approval). These are scoped per user_id, not
  per household_id: a user must be able to look up their own membership before any
  household scope exists. Ledger repositories (transaction, goal, receipt, ...) are
  the ones that enforce household scoping.
*/

export interface UserRepository {
  findByEmail(email: string): Promise<{ id: string; email: string; passwordHash: string; displayName: string } | null>;
  create(data: { email: string; passwordHash: string; displayName: string }): Promise<{ id: string; email: string; displayName: string }>;
  findById(id: string): Promise<{ id: string; email: string; displayName: string } | null>;
}

export type MembershipRecord = {
  id: string;
  householdId: string;
  userId: string;
  role: string;
  status: string;
  invitedByUserId: string | null;
  inviteId: string | null;
  requestedAt: Date | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  declinedAt: Date | null;
  declinedByUserId: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  decisionReason: string | null;
  /** Present on household listings (joined for the Family page). */
  user?: { id: string; displayName: string; email: string } | null;
};

export interface HouseholdRepository {
  create(data: { name: string; ownerUserId: string }): Promise<{ id: string; name: string; ownerUserId: string }>;
  findById(id: string): Promise<{ id: string; name: string; ownerUserId: string } | null>;
}

export interface MembershipRepository {
  findActiveByUserId(userId: string): Promise<MembershipRecord | null>;
  findLatestByUserId(userId: string): Promise<MembershipRecord | null>;
  findByUserAndHousehold(userId: string, householdId: string): Promise<MembershipRecord | null>;
  findById(id: string): Promise<MembershipRecord | null>;
  create(data: {
    householdId: string;
    userId: string;
    role: "OWNER" | "MEMBER";
    status: "PENDING" | "APPROVED" | "DECLINED" | "REVOKED";
    invitedByUserId?: string | null;
    inviteId?: string | null;
    requestedAt?: Date | null;
  }): Promise<MembershipRecord>;
  updateStatus(
    householdId: string,
    id: string,
    patch: {
      status: "PENDING" | "APPROVED" | "DECLINED" | "REVOKED";
      approvedAt?: Date | null;
      approvedByUserId?: string | null;
      declinedAt?: Date | null;
      declinedByUserId?: string | null;
      revokedAt?: Date | null;
      revokedByUserId?: string | null;
      decisionReason?: string | null;
    },
  ): Promise<MembershipRecord | null>;
  listByHousehold(householdId: string): Promise<MembershipRecord[]>;
}

export interface MembershipEventRepository {
  append(data: {
    membershipId: string;
    householdId: string;
    actorUserId: string;
    eventType: "REQUESTED" | "APPROVED" | "DECLINED" | "REVOKED";
    previousStatus?: "PENDING" | "APPROVED" | "DECLINED" | "REVOKED" | null;
    nextStatus?: "PENDING" | "APPROVED" | "DECLINED" | "REVOKED" | null;
    reason?: string | null;
  }): Promise<void>;
}

export interface InviteRepository {
  create(data: { householdId: string; codeHash: string; createdByUserId: string; expiresAt: Date }): Promise<{
    id: string;
    householdId: string;
    codeHash: string;
    createdByUserId: string;
    expiresAt: Date;
    redeemedAt: Date | null;
    revokedAt: Date | null;
  }>;
  findByCodeHash(codeHash: string): Promise<{ id: string; householdId: string; createdByUserId: string; expiresAt: Date; redeemedAt: Date | null; revokedAt: Date | null } | null>;
  /** Conditional update + rowcount check (anti-race redeem, ERD §3.4). */
  redeemConditional(id: string, userId: string): Promise<number>;
  revoke(householdId: string, id: string): Promise<{ id: string; revokedAt: Date | null } | null>;
}

export interface SessionRepository {
  create(data: { id: string; userId: string; tokenVersion: string; expiresAt: Date }): Promise<void>;
  findActiveById(id: string): Promise<{
    id: string;
    userId: string;
    tokenVersion: string;
    expiresAt: Date;
    lastSeenAt?: Date;
  } | null>;
  touch(id: string, lastSeenAt?: Date): Promise<void>;
  revoke(id: string): Promise<void>;
  purgeExpired(): Promise<void>;
}

export function createUserRepository(db: Db): UserRepository {
  return {
    async findByEmail(email) {
      const row = await db.user.findUnique({ where: { email } });
      return row;
    },
    async create(data) {
      const row = await db.user.create({ data });
      return { id: row.id, email: row.email, displayName: row.displayName };
    },
    async findById(id) {
      return db.user.findUnique({
        where: { id },
        select: { id: true, email: true, displayName: true },
      });
    },
  };
}

export function createHouseholdRepository(db: Db): HouseholdRepository {
  return {
    async create(data) {
      const row = await db.household.create({ data });
      return { id: row.id, name: row.name, ownerUserId: row.ownerUserId };
    },
    async findById(id) {
      return db.household.findUnique({
        where: { id },
        select: { id: true, name: true, ownerUserId: true },
      });
    },
  };
}

export function createMembershipRepository(db: Db): MembershipRepository {
  return {
    async findActiveByUserId(userId) {
      const row = await db.membership.findFirst({
        where: { userId, status: { in: ["PENDING", "APPROVED"] } },
      });
      return row;
    },
    async findLatestByUserId(userId) {
      return db.membership.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    },
    async findById(id) {
      const row = await db.membership.findUnique({ where: { id } });
      return row;
    },
    async findByUserAndHousehold(userId, householdId) {
      const row = await db.membership.findUnique({
        where: { userId_householdId: { userId, householdId } },
      });
      return row;
    },
    async create(data) {
      const row = await db.membership.create({ data });
      return row;
    },
    async updateStatus(householdId, id, patch) {
      /*
        Extended-unique where (id + householdId): a membership from another
        household resolves to null instead of being mutated (ADR-006).
      */
      const row = await db.membership.updateMany({ where: { id, householdId }, data: patch });
      if (row.count === 0) return null;
      return db.membership.findUnique({ where: { id } });
    },
    async listByHousehold(householdId) {
      // Join the member's public profile so the Family page can show names.
      const rows = await db.membership.findMany({
        where: { householdId },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      });
      return rows;
    },
  };
}

export function createMembershipEventRepository(db: Db): MembershipEventRepository {
  return {
    async append(data) {
      await db.membershipEvent.create({ data });
    },
  };
}

export function createInviteRepository(db: Db): InviteRepository {
  return {
    async create(data) {
      const row = await db.invite.create({ data });
      return { id: row.id, householdId: row.householdId, codeHash: row.codeHash, createdByUserId: row.createdByUserId, expiresAt: row.expiresAt, redeemedAt: row.redeemedAt, revokedAt: row.revokedAt };
    },
    async findByCodeHash(codeHash) {
      return db.invite.findUnique({ where: { codeHash } });
    },
    async redeemConditional(id, userId) {
      /*
        Conditional update + rowcount (ERD §3.4): redeem only when the invite is
        still unredeemed, unrevoked, and unexpired — never read-then-write.
      */
      const result = await db.invite.updateMany({
        where: { id, redeemedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { redeemedAt: new Date(), redeemedByUserId: userId },
      });
      return result.count;
    },
    async revoke(householdId, id) {
      const result = await db.invite.updateMany({
        where: { id, householdId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) return null;
      const row = await db.invite.findUnique({ where: { id } });
      return row ? { id: row.id, revokedAt: row.revokedAt } : null;
    },
  };
}

export function createSessionRepository(db: Db): SessionRepository {
  return {
    async create(data) {
      await db.session.create({ data });
    },
    async findActiveById(id) {
      const row = await db.session.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          tokenVersion: true,
          expiresAt: true,
          revokedAt: true,
          lastSeenAt: true,
        },
      });
      if (!row) return null;
      if (row.revokedAt !== null || row.expiresAt <= new Date()) return null;
      return {
        id: row.id,
        userId: row.userId,
        tokenVersion: row.tokenVersion,
        expiresAt: row.expiresAt,
        lastSeenAt: row.lastSeenAt,
      };
    },
    async touch(id, lastSeenAt) {
      if (lastSeenAt && Date.now() - lastSeenAt.getTime() < 5 * 60 * 1000) return;
      await db.session.update({ where: { id }, data: { lastSeenAt: new Date() } });
    },
    async revoke(id) {
      await db.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    },
    async purgeExpired() {
      await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    },
  };
}

/**
 * Bundles the six auth-domain repositories for one Prisma client (or one
 * interactive transaction). The composition root and the transaction runner
 * both build from here, so the services never import Prisma directly (ADR-006).
 */
export function createAuthRepositories(db: Db): {
  user: UserRepository;
  household: HouseholdRepository;
  membership: MembershipRepository;
  invite: InviteRepository;
  session: SessionRepository;
  membershipEvent: MembershipEventRepository;
} {
  return {
    user: createUserRepository(db),
    household: createHouseholdRepository(db),
    membership: createMembershipRepository(db),
    invite: createInviteRepository(db),
    session: createSessionRepository(db),
    membershipEvent: createMembershipEventRepository(db),
  };
}