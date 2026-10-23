/*
  T-008 QA-finding regression (DB-backed).

  The pg adapter's `timestamptz` encoding assumes a UTC session: Date params are
  sent as a UTC wall-clock string with no offset, and result text has its offset
  rewritten to +00:00. On a non-UTC database (the local DB runs `Asia/Bangkok`)
  every instant shifted by the session offset, self-consistently inside the app
  but not in raw SQL. `createIntegrationPrisma` now pins `-c TimeZone=UTC`; this
  test compares the exact persisted epoch so it fails if that option is dropped.
*/

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  cleanupIntegrationFixtures,
  createIntegrationPrisma,
  seedIntegrationFixtures,
  type IntegrationFixtures,
} from "../testing/integration-db";

/* 2026-10-07 12:00 Asia/Jakarta = the instant `dateOnlyToNoonJakarta` produces (A-12). */
const INSTANT = new Date("2026-10-07T05:00:00.000Z");

describe("PrismaPg timestamptz round-trip (T-008 QA finding)", () => {
  let prisma: PrismaClient;
  let fixtures: IntegrationFixtures;

  beforeAll(() => {
    prisma = createIntegrationPrisma();
  });

  beforeEach(async () => {
    fixtures = await seedIntegrationFixtures(prisma);
  });

  afterEach(async () => {
    await cleanupIntegrationFixtures(prisma, fixtures);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("stores a UTC instant without a session-timezone shift", async () => {
    const created = await prisma.transaction.create({
      data: {
        householdId: fixtures.householdId,
        createdByUserId: fixtures.userId,
        type: "MONEY_OUT",
        amountMinor: 1_000,
        category: "other",
        occurredAt: INSTANT,
        source: "MANUAL",
        walletId: fixtures.walletId,
      },
    });
    expect(created.occurredAt.getTime()).toBe(INSTANT.getTime());

    const read = await prisma.transaction.findUnique({ where: { id: created.id } });
    expect(read?.occurredAt.getTime()).toBe(INSTANT.getTime());

    /* Raw DB epoch: proves the persisted instant, not just the adapter's own view. */
    const [raw] = await prisma.$queryRaw<Array<{ epoch_ms: bigint }>>`
      SELECT (extract(epoch FROM occurred_at) * 1000)::bigint AS epoch_ms
      FROM "transaction" WHERE id = ${created.id}
    `;
    expect(Number(raw?.epoch_ms)).toBe(INSTANT.getTime());
  });
});
