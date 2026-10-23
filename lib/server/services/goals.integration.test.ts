/*
  DB integration for T-007 (AC-F4-1..AC-F4-6). Exercises the real repository
  semantics the fakes cannot fully replicate: CHECK constraints, conditional
  updates, and prune ordering across households.
*/

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createPlanningRepositories, type PlanningRepositories } from "../repositories/ledger";
import {
  cleanupIntegrationFixtures,
  createIntegrationPrisma,
  seedIntegrationFixtures,
  type IntegrationFixtures,
} from "../testing/integration-db";
import { createFakeAdvisorProvider } from "../testing/fakes";
import { AdvisorService } from "./advisor";
import { GoalService } from "./goal";
import { AppError } from "../errors";
import { jakartaDateOnly } from "../jakarta";
import type { PlanningTransaction } from "./types";

function createIntegrationPlanningTransaction(prisma: PrismaClient): PlanningTransaction {
  return <T>(fn: (repos: PlanningRepositories) => Promise<T>): Promise<T> =>
    prisma.$transaction(
      (tx) => fn(createPlanningRepositories(tx as unknown as never)),
      { timeout: 20_000, maxWait: 5_000 },
    );
}

describe("Goals + advisor DB integration (T-007)", () => {
  let prisma: PrismaClient;
  let fixtures: IntegrationFixtures;
  let extraFixtures: IntegrationFixtures | null = null;

  beforeAll(() => {
    prisma = createIntegrationPrisma();
  });

  beforeEach(async () => {
    fixtures = await seedIntegrationFixtures(prisma);
  });

  afterEach(async () => {
    if (extraFixtures) await cleanupIntegrationFixtures(prisma, extraFixtures);
    extraFixtures = null;
    await cleanupIntegrationFixtures(prisma, fixtures);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("completes create -> increment -> progress -> trash -> restore end-to-end (AC-F4-1..AC-F4-4)", async () => {
    const repos = createPlanningRepositories(prisma as unknown as never);
    const service = new GoalService(repos, createIntegrationPlanningTransaction(prisma));

    const created = await service.create(
      { userId: fixtures.userId, householdId: fixtures.householdId },
      { name: "Dana liburan", targetAmountMinor: 1_000_000, deadline: "2026-12-31" },
    );
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;

    await service.adjustSaved({ userId: fixtures.userId, householdId: fixtures.householdId }, id, 400_000);
    await service.adjustSaved({ userId: fixtures.userId, householdId: fixtures.householdId }, id, 600_000);
    const row = await prisma.savingsGoal.findFirst({ where: { id } });
    expect(row?.savedAmountMinor).toBe(1_000_000);

    /* Negative result rejected by the conditional update, no change. */
    const rejected = await service
      .adjustSaved({ userId: fixtures.userId, householdId: fixtures.householdId }, id, -1_000_001)
      .catch((caught: unknown) => caught);
    expect(rejected).toBeInstanceOf(AppError);
    expect((rejected as AppError).code).toBe("SAVED_AMOUNT_INVALID");
    const unchanged = await prisma.savingsGoal.findFirst({ where: { id } });
    expect(unchanged?.savedAmountMinor).toBe(1_000_000);

    /* Trashed goal: increment becomes 404, list loses it, restore brings it back. */
    const actor = { userId: fixtures.userId, householdId: fixtures.householdId };
    await service.trash(actor, id);
    const incrementFailure = await service.adjustSaved(actor, id, 100).catch((caught: unknown) => caught);
    expect((incrementFailure as AppError).code).toBe("NOT_FOUND");

    const trashPage = await service.listTrash(fixtures.householdId);
    expect((trashPage.body as { rows: Array<{ id: string }> }).rows.map((row) => row.id)).toContain(id);

    const restored = await service.restore(actor, id);
    expect(restored.status).toBe(200);
    const active: { status: number; body: unknown } = await service.list(fixtures.householdId);
    expect((active.body as { rows: Array<{ id: string }> }).rows.map((row) => row.id)).toContain(id);
  });

  it("prunes the oldest insight when an 11th is created (AC-F4-6, D-16)", async () => {
    const repos = createPlanningRepositories(prisma as unknown as never);
    const { provider } = createFakeAdvisorProvider({
      ok: true,
      model: "fake-model",
      raw: {
        headline: "Insight uji.",
        summary: "Ringkasan uji.",
        actions: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
        limitations: "Ini bukan nasihat keuangan profesional.",
        sourcePeriod: { start: jakartaDateOnly(), end: jakartaDateOnly() },
      },
    });
    const service = new AdvisorService(repos, createIntegrationPlanningTransaction(prisma), provider);

    for (let day = 1; day <= 11; day += 1) {
      const dateOnly = `2026-09-${String(day).padStart(2, "0")}`;
      const result = await service.getInsight(
        { userId: fixtures.userId, householdId: fixtures.householdId },
        { start: dateOnly, end: dateOnly },
      );
      expect(result.status).toBe(200);
    }
    const remaining = await prisma.advisorInsight.findMany({ where: { householdId: fixtures.householdId } });
    expect(remaining).toHaveLength(10);
    const starts = remaining.map((row) => row.sourcePeriodStart.toISOString().slice(0, 10));
    expect(starts).not.toContain("2026-09-01");
  });

  it("keeps insights and goals isolated per household (AC-F4-6)", async () => {
    const repos = createPlanningRepositories(prisma as unknown as never);
    const { provider } = createFakeAdvisorProvider({
      ok: true,
      model: "fake-model",
      raw: {
        headline: "Insight uji.",
        summary: "Ringkasan uji.",
        actions: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
        limitations: "Ini bukan nasihat keuangan profesional.",
        sourcePeriod: { start: jakartaDateOnly(), end: jakartaDateOnly() },
      },
    });
    const service = new AdvisorService(repos, createIntegrationPlanningTransaction(prisma), provider);
    const today = jakartaDateOnly();

    const other = await seedIntegrationFixtures(prisma);
    extraFixtures = other;
    try {
      /* Household A warms the cache for a period; household B must not get it. */
      await service.getInsight(
        { userId: fixtures.userId, householdId: fixtures.householdId },
        { start: today, end: today },
      );
      const bResult = await service.getInsight(
        { userId: other.userId, householdId: other.householdId },
        { start: today, end: today },
      );
      expect((bResult.body as unknown as { delivery: string }).delivery).toBe("FRESH");

      /* Trash in B must never show in A's trash list (scoped repository). */
      const bGoalRepos = createPlanningRepositories(prisma).goal;
      const bGoal = await bGoalRepos.create({
        householdId: other.householdId,
        createdByUserId: other.userId,
        name: "Goal B",
        targetAmountMinor: 1000,
      });
      await bGoalRepos.softDelete(other.householdId, bGoal.id, other.userId);
      const aTrash: { status: number; body: unknown } = await new GoalService(
        repos,
        createIntegrationPlanningTransaction(prisma),
      ).listTrash(fixtures.householdId);
      expect((aTrash.body as { rows: Array<{ id: string }> }).rows).toHaveLength(0);

      /* Goal id of A is invisible from B: adjustSaved 404. */
      const aGoal = await createPlanningRepositories(prisma).goal.create({
        householdId: fixtures.householdId,
        createdByUserId: fixtures.userId,
        name: "Goal A",
        targetAmountMinor: 1000,
      });
      const crossPatch = await new GoalService(
        repos,
        createIntegrationPlanningTransaction(prisma),
      )
        .adjustSaved({ userId: other.userId, householdId: other.householdId }, aGoal.id, 100)
        .catch((caught: unknown) => caught);
      expect((crossPatch as AppError).code).toBe("NOT_FOUND");
    } finally {
      await cleanupIntegrationFixtures(prisma, other);
      extraFixtures = null;
    }
  });
});

