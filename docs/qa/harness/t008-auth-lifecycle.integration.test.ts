import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createIntegrationPrisma } from "@/lib/server/testing/integration-db";
import { createAuthRepositories } from "@/lib/server/repositories/auth";
import { createTransactionRepository } from "@/lib/server/repositories/ledger";
import type { Db } from "@/lib/server/repositories/types";
import { AuthService } from "@/lib/server/services/auth";
import { FamilyService } from "@/lib/server/services/family";
import { AppError, accessDeniedForStatus } from "@/lib/server/errors";

describe("T-008 auth lifecycle DB retest", () => {
  let db: PrismaClient;
  beforeAll(() => {
    const u = new URL(process.env.DATABASE_URL ?? "");
    if (u.hostname !== "localhost" || (u.port || "5432") !== "5432" || u.pathname !== "/financial_planner_t003") {
      throw new Error("Refusing DB target outside verified local T-003 database");
    }
    db = createIntegrationPrisma();
  });
  afterAll(async () => { await db?.$disconnect(); });

  it("runs owner/invite/pending/approval/revoke, scoping, and session revocation against PostgreSQL", async () => {
    const repos = createAuthRepositories(db as unknown as Db);
    const transaction = <T,>(fn: (r: ReturnType<typeof createAuthRepositories>) => Promise<T>) =>
      db.$transaction(tx => fn(createAuthRepositories(tx as unknown as Db)));
    const auth = new AuthService(repos, transaction);
    const family = new FamilyService(repos);
    const suffix = randomUUID();
    const ownerEmail = `qa-t008-auth-${suffix}-owner@test.local`;
    const inviteeEmail = `qa-t008-auth-${suffix}-invitee@test.local`;
    const otherEmail = `qa-t008-auth-${suffix}-other@test.local`;
    const ownedUserIds: string[] = [];
    const householdIds: string[] = [];
    let inviteId: string | null = null;
    try {
      const owner = await auth.signup({ email: ownerEmail, displayName: "QA owner", password: "qa-test-password-123" });
      ownedUserIds.push(owner.state.user.id); householdIds.push(owner.state.household!.id);
      const other = await auth.signup({ email: otherEmail, displayName: "QA other", password: "qa-test-password-123" });
      ownedUserIds.push(other.state.user.id); householdIds.push(other.state.household!.id);

      const issued = await family.createInvite(owner.state.user.id, owner.state.household!.id);
      inviteId = issued.invite.id;
      const pending = await auth.signup({ email: inviteeEmail, displayName: "QA invitee", password: "qa-test-password-123", inviteCode: issued.plaintextCode });
      ownedUserIds.push(pending.state.user.id);
      expect(pending.state.status).toBe("PENDING");
      const pendingAccess = accessDeniedForStatus(pending.state.status);
      expect(pendingAccess).toBeInstanceOf(AppError);
      expect((pendingAccess as AppError).statusCode).toBe(403);

      const membership = await repos.membership.findByUserAndHousehold(pending.state.user.id, owner.state.household!.id);
      expect(membership?.status).toBe("PENDING");
      await family.approve(owner.state.user.id, membership!.id);
      expect((await auth.revalidate(pending.sessionId)).state.status).toBe("APPROVED");

      const txRepo = createTransactionRepository(db as unknown as Db);
      const record = await txRepo.create({ householdId: owner.state.household!.id, createdByUserId: owner.state.user.id,
        type: "MONEY_OUT", amountMinor: 77, occurredAt: new Date(), source: "MANUAL", note: "qa-t008" });
      expect(await txRepo.findById(other.state.household!.id, record.id)).toBeNull();

      await family.revoke(owner.state.user.id, membership!.id);
      expect((await auth.revalidate(pending.sessionId)).state.status).toBe("REVOKED");
      const revokedAccess = accessDeniedForStatus((await auth.revalidate(pending.sessionId)).state.status);
      expect(revokedAccess).toBeInstanceOf(AppError);
      expect((revokedAccess as AppError).statusCode).toBe(403);

      await auth.logout(owner.sessionId);
      await expect(auth.revalidate(owner.sessionId)).rejects.toMatchObject({ statusCode: 401 });
      console.log("T008 assertions passed: owner/invite/pending/403/approve/revalidate/revoke/403/scoped 404/session logout");
    } finally {
      const ids = ownedUserIds;
      await db.membershipEvent.deleteMany({ where: { membership: { userId: { in: ids } } } });
      await db.transaction.deleteMany({ where: { householdId: { in: householdIds } } });
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.membership.deleteMany({ where: { userId: { in: ids } } });
      if (inviteId) await db.invite.deleteMany({ where: { id: inviteId } });
      await db.household.deleteMany({ where: { id: { in: householdIds } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      const leftovers = await db.user.count({ where: { email: { startsWith: `qa-t008-auth-${suffix}-` } } });
      expect(leftovers).toBe(0);
      console.log("T008 cleanup confirmed: zero generated fixture users remain");
    }
  }, 120_000);
});
