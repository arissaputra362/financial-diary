/*
  T-011 DB integration (AC-BI-2, AC-BI-6..AC-BI-10, AC-BI-13).

  Exercises what the in-memory fakes cannot: the partial unique active-name
  index, the wallet XOR CHECK, the real join that keeps an archived label
  resolvable, and seed repeatability against PostgreSQL.
*/

/*
  Synthetic private institution names in this file are test fixtures only and
  are never seeded into the official catalog. Official rows come from the
  verified seed or explicit OJK-shaped test fixtures.
*/

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createLedgerRepositories, type LedgerRepositories } from "../repositories/ledger";
import {
  cleanupIntegrationFixtures,
  createIntegrationLedgerTransaction,
  createIntegrationPrisma,
  seedIntegrationFixtures,
  type IntegrationFixtures,
} from "../testing/integration-db";
import { seedBankInstitutions } from "../../../prisma/seed-bank-institutions";
import { InstitutionService } from "./institution";
import { IdempotencyService } from "./idempotency";
import { WalletService } from "./wallet";

type Harness = {
  prisma: PrismaClient;
  repos: LedgerRepositories;
  institutions: InstitutionService;
  wallets: WalletService;
};

function buildHarness(prisma: PrismaClient): Harness {
  const repos = createLedgerRepositories(prisma as unknown as never);
  const transaction = createIntegrationLedgerTransaction(prisma);
  const idempotency = new IdempotencyService(transaction);
  return {
    prisma,
    repos,
    institutions: new InstitutionService(repos, transaction, idempotency),
    wallets: new WalletService(repos, transaction, idempotency),
  };
}

describe("Bank institutions DB integration (T-011)", () => {
  let harness: Harness;
  let fixtures: IntegrationFixtures;
  let extraFixtures: IntegrationFixtures | null = null;
  let extraUserIds: string[] = [];

  beforeAll(async () => {
    harness = buildHarness(createIntegrationPrisma());
    await seedBankInstitutions(harness.prisma);
  });

  beforeEach(async () => {
    fixtures = await seedIntegrationFixtures(harness.prisma);
  });

  afterEach(async () => {
    for (const userId of extraUserIds) {
      await harness.prisma.userCustomInstitution.deleteMany({ where: { userId } });
      await harness.prisma.membership.deleteMany({ where: { userId } });
      await harness.prisma.user.deleteMany({ where: { id: userId } });
    }
    extraUserIds = [];
    if (extraFixtures) await cleanupIntegrationFixtures(harness.prisma, extraFixtures);
    extraFixtures = null;
    await cleanupIntegrationFixtures(harness.prisma, fixtures);
  });

  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  function actorA() {
    return { userId: fixtures.userId, householdId: fixtures.householdId, role: "OWNER" };
  }

  async function addApprovedMember(): Promise<{ userId: string; actor: { userId: string; householdId: string; role: string } }> {
    const user = await harness.prisma.user.create({
      data: {
        email: `it-member-${crypto.randomUUID()}@test.local`,
        passwordHash: "not-a-real-hash",
        displayName: "Integration Member",
      },
    });
    await harness.prisma.membership.create({
      data: {
        householdId: fixtures.householdId,
        userId: user.id,
        role: "MEMBER",
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });
    extraUserIds.push(user.id);
    return {
      userId: user.id,
      actor: { userId: user.id, householdId: fixtures.householdId, role: "MEMBER" },
    };
  }

  it("seeds the verified catalog idempotently without duplicates or deactivations (AC-BI-2/AC-BI-13)", async () => {
    const active = await harness.prisma.bankInstitution.count({ where: { isActive: true } });
    expect(active).toBe(105);
    const total = await harness.prisma.bankInstitution.count();
    expect(total).toBe(105);
    /* Month-level provenance: every row keeps the stated period, no fake day. */
    const period = await harness.prisma.bankInstitution.groupBy({
      by: ["sourcePeriod"],
      _count: { _all: true },
    });
    expect(period).toEqual([{ sourcePeriod: "2026-06", _count: { _all: 105 } }]);

    const second = await seedBankInstitutions(harness.prisma);
    expect(second.inserted).toBe(0);
    expect(second.deactivated).toBe(0);
    expect(second.total).toBe(105);
    expect(second.sourcePeriod).toBe("2026-06");
    expect(Number.isNaN(Date.parse(second.importedAt))).toBe(false);
    expect(await harness.prisma.bankInstitution.count()).toBe(105);
    expect(
      await harness.prisma.bankInstitution.count({ where: { isActive: true } }),
    ).toBe(105);
  });

  it("leaves every existing wallet manual (both refs null) and never backfills (AC-BI-2)", async () => {
    const wallet = await harness.prisma.wallet.findUniqueOrThrow({
      where: { id: fixtures.walletId },
    });
    expect(wallet.officialInstitutionId).toBeNull();
    expect(wallet.customInstitutionId).toBeNull();
    const dto = await harness.wallets.get(actorA(), fixtures.walletId);
    expect(dto.institution).toBeNull();
  });

  it("enforces the partial unique active-name index and reactivates archived rows (AC-BI-5/AC-BI-8)", async () => {
    const created = await harness.institutions.quickAdd(actorA(), "Bank Pasar Loka");
    expect(created.status).toBe(201);
    const row = created.body as { id: string };

    await expect(
      harness.institutions.quickAdd(actorA(), "  BANK   pasar loka "),
    ).rejects.toMatchObject({ statusCode: 409, code: "INSTITUTION_ALREADY_EXISTS" });

    /* The DB index is the last line of defense, not just the service check. */
    await expect(
      harness.prisma.userCustomInstitution.create({
        data: {
          userId: fixtures.userId,
          displayName: "Bank Pasar Loka",
          normalizedName: "bank pasar loka",
        },
      }),
    ).rejects.toThrow();

    await harness.institutions.setArchived(actorA(), row.id, true);
    const readded = await harness.institutions.quickAdd(actorA(), "bank pasar loka");
    expect(readded.status).toBe(200);
    expect((readded.body as { id: string }).id).toBe(row.id);
    const count = await harness.prisma.userCustomInstitution.count({
      where: { userId: fixtures.userId, normalizedName: "bank pasar loka" },
    });
    expect(count).toBe(1);
  });

  it("keeps a wallet label after archive and hides the custom id from another member (AC-BI-6/AC-BI-8)", async () => {
    const member = await addApprovedMember();
    const custom = await harness.institutions.quickAdd(actorA(), "Bank Pasar Loka");
    const customId = (custom.body as { id: string }).id;

    const created = await harness.wallets.create(actorA(), {
      name: "Rencana Libur",
      scope: "SHARING",
      institution: { kind: "CUSTOM", id: customId },
    });
    const walletId = (created.body as { id: string }).id;

    await harness.institutions.setArchived(actorA(), customId, true);

    const ownerView = await harness.wallets.get(actorA(), walletId);
    expect(ownerView.institution).toEqual({
      kind: "CUSTOM",
      id: customId,
      name: "Bank Pasar Loka",
    });

    const memberView = await harness.wallets.get(member.actor, walletId);
    expect(memberView.institution).toEqual({
      kind: "CUSTOM",
      id: null,
      name: "Bank Pasar Loka",
    });

    const memberList = await harness.institutions.list(member.actor);
    expect(memberList.custom).toHaveLength(0);
    expect(memberList.archivedCustom).toHaveLength(0);

    const ownerList = await harness.institutions.list(actorA());
    expect(ownerList.custom).toHaveLength(0);
    expect(ownerList.archivedCustom).toEqual([
      expect.objectContaining({ id: customId, name: "Bank Pasar Loka" }),
    ]);
  });

  it("rejects restoring an archived custom row that collides with an active official name (AC-BI-8/Q8)", async () => {
    const official = await harness.prisma.bankInstitution.create({
      data: {
        displayName: "PT BANK UJI RESTORE",
        normalizedName: "pt bank uji restore",
        source: "OJK_OFFICE_LIST",
        sourceUrl: "https://ojk.go.id/example",
        sourcePeriod: "2026-06",
        sourceRef: "998",
        seedVersion: "test-seed",
        isActive: true,
      },
    });
    const archived = await harness.prisma.userCustomInstitution.create({
      data: {
        userId: fixtures.userId,
        displayName: "PT Bank Uji Restore",
        normalizedName: "pt bank uji restore",
        archivedAt: new Date(),
      },
    });

    try {
      await expect(
        harness.institutions.setArchived(actorA(), archived.id, false),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "INSTITUTION_ALREADY_EXISTS",
        meta: {
          existing: { kind: "OFFICIAL", id: official.id, name: official.displayName },
        },
      });
      const after = await harness.prisma.userCustomInstitution.findUniqueOrThrow({
        where: { id: archived.id },
      });
      expect(after.archivedAt).not.toBeNull();
    } finally {
      await harness.prisma.bankInstitution.delete({ where: { id: official.id } });
    }
  });

  it("rejects foreign custom ids, archived custom ids, and inactive official ids (AC-BI-7/AC-BI-10)", async () => {
    extraFixtures = await seedIntegrationFixtures(harness.prisma);
    const foreignActor = {
      userId: extraFixtures.userId,
      householdId: extraFixtures.householdId,
      role: "OWNER",
    };
    const foreign = await harness.institutions.quickAdd(foreignActor, "Bank Rahasia");
    const foreignId = (foreign.body as { id: string }).id;

    await expect(
      harness.wallets.create(actorA(), {
        name: "Dompet",
        scope: "PERSONAL",
        institution: { kind: "CUSTOM", id: foreignId },
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    const own = await harness.institutions.quickAdd(actorA(), "Bank Pasar Loka");
    const ownId = (own.body as { id: string }).id;
    await harness.institutions.setArchived(actorA(), ownId, true);
    await expect(
      harness.wallets.create(actorA(), {
        name: "Dompet",
        scope: "PERSONAL",
        institution: { kind: "CUSTOM", id: ownId },
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: "INSTITUTION_UNAVAILABLE" });

    const bank = await harness.prisma.bankInstitution.findFirstOrThrow({
      where: { isActive: true },
    });
    await harness.prisma.bankInstitution.update({
      where: { id: bank.id },
      data: { isActive: false },
    });
    try {
      await expect(
        harness.wallets.create(actorA(), {
          name: "Dompet",
          scope: "PERSONAL",
          institution: { kind: "OFFICIAL", id: bank.id },
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: "INSTITUTION_UNAVAILABLE" });
    } finally {
      await harness.prisma.bankInstitution.update({
        where: { id: bank.id },
        data: { isActive: true },
      });
    }
  });

  it("deactivates a catalog row missing from the snapshot instead of deleting it (A-58)", async () => {
    const fake = await harness.prisma.bankInstitution.create({
      data: {
        displayName: "PT BANK UJI SNAPSHOT",
        normalizedName: "pt bank uji snapshot",
        source: "OJK_OFFICE_LIST",
        sourceUrl: "https://ojk.go.id/example",
        sourcePeriod: "2026-01",
        sourceRef: "999",
        seedVersion: "old-test-seed",
        isActive: true,
      },
    });
    try {
      const report = await seedBankInstitutions(harness.prisma);
      expect(report.deactivated).toBe(1);
      const row = await harness.prisma.bankInstitution.findUniqueOrThrow({
        where: { id: fake.id },
      });
      expect(row.isActive).toBe(false);
      expect(await harness.prisma.bankInstitution.count({ where: { id: fake.id } })).toBe(1);
    } finally {
      await harness.prisma.bankInstitution.delete({ where: { id: fake.id } });
    }
  });

  it("rejects a wallet with both institution references at the DB level (AC-BI-9)", async () => {
    const bank = await harness.prisma.bankInstitution.findFirstOrThrow({
      where: { isActive: true },
    });
    const custom = await harness.institutions.quickAdd(actorA(), "Bank Pasar Loka");
    const customId = (custom.body as { id: string }).id;

    await expect(
      harness.prisma.wallet.update({
        where: { id: fixtures.walletId },
        data: {
          officialInstitutionId: bank.id,
          customInstitutionId: customId,
        },
      }),
    ).rejects.toThrow();
  });
});
