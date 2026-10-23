/*
  TEST-ONLY DB integration harness (BUG-002 / BUG-001).

  Unit tests use `fakes.ts`; these helpers connect the real services to a real
  PostgreSQL so transaction semantics (P2002 abort/savepoint, CHECK constraints,
  rollbacks) are exercised. The app's runtime adapter is Neon (`lib/db.ts`),
  which only reaches Neon; `@prisma/adapter-pg` is a dev dependency used here to
  talk to the local test database. Never imported by application code.
*/

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { createLedgerRepositories, type LedgerRepositories } from "../repositories/ledger";
import type { Db } from "../repositories/types";
import type { LedgerTransaction } from "../services/types";

export type IntegrationFixtures = {
  userId: string;
  householdId: string;
  walletId: string;
  email: string;
};

export function integrationDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run DB integration tests.");
  /* node-postgres does not understand Prisma's `?schema=public` query param. */
  return url.replace(/\?.*$/, "");
}

export function createIntegrationPrisma(): PrismaClient {
  /*
    `options: '-c TimeZone=UTC'` mirrors the runtime pg branch in `lib/db.ts`.
    The pg adapter's timestamptz encoding assumes a UTC session; without it,
    timestamps written/read against a non-UTC database shift by the session
    offset (T-008 QA finding; the local DB runs `Asia/Bangkok`).
  */
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: integrationDatabaseUrl(),
      options: "-c TimeZone=UTC",
    }),
  });
}

/** Mirrors `createLedgerTransaction` in lib/server/auth.ts (20s OCR budget). */
export function createIntegrationLedgerTransaction(prisma: PrismaClient): LedgerTransaction {
  return <T>(fn: (repos: LedgerRepositories) => Promise<T>): Promise<T> =>
    prisma.$transaction((tx) => fn(createLedgerRepositories(tx as unknown as Db)), {
      timeout: 20_000,
      maxWait: 5_000,
    });
}

export async function seedIntegrationFixtures(prisma: PrismaClient): Promise<IntegrationFixtures> {
  const suffix = randomUUID();
  const email = `it-${suffix}@test.local`;
  const user = await prisma.user.create({
    data: { email, passwordHash: "not-a-real-hash", displayName: "Integration Test" },
  });
  const household = await prisma.household.create({
    data: { name: `IT Household ${suffix}`, ownerUserId: user.id },
  });
  /* T-009: every transaction needs a wallet; seed a default SHARING one. */
  const wallet = await prisma.wallet.create({
    data: {
      householdId: household.id,
      createdByUserId: user.id,
      scope: "SHARING",
      name: "Dompet Keluarga",
      openingBalanceMinor: 0,
      systemKey: "legacy_default",
    },
  });
  return { userId: user.id, householdId: household.id, walletId: wallet.id, email };
}

/** Deletes fixtures in FK (RESTRICT) order; safe to call repeatedly. */
export async function cleanupIntegrationFixtures(
  prisma: PrismaClient,
  fixtures: IntegrationFixtures,
): Promise<void> {
  await prisma.idempotencyKey.deleteMany({ where: { userId: fixtures.userId } });
  /* FK RESTRICT below: clear children before the household (T-007/T-015 rows too). */
  await prisma.personalBudget.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.advisorInsight.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.savingsGoal.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.transaction.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.wallet.deleteMany({ where: { householdId: fixtures.householdId } });
  /* T-011: custom institutions are user-scoped and block user deletion (RESTRICT). */
  await prisma.userCustomInstitution.deleteMany({ where: { userId: fixtures.userId } });
  await prisma.ocrJob.deleteMany({ where: { receipt: { householdId: fixtures.householdId } } });
  await prisma.receipt.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.membershipEvent.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.membership.deleteMany({ where: { householdId: fixtures.householdId } });
  await prisma.household.deleteMany({ where: { id: fixtures.householdId } });
  await prisma.user.deleteMany({ where: { id: fixtures.userId } });
}
