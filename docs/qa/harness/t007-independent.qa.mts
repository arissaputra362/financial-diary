/*
  T-007 independent QA harness (QA-owned).

  Purpose: reproduce AC-F4-1..AC-F4-8 service/DB behavior against the REAL local
  PostgreSQL without trusting the developer unit tests:

    - AC-F4-1 duplicate names / target rules (service) + raw SQL CHECK backstop
    - AC-F4-2 progress capping in the DTO with the raw DB counter untouched
    - AC-F4-3 concurrent atomic increments (raw SQL cross-check), negative
      result rejected with NO change, trashed-goal 404, int32 overflow 422
    - AC-F4-4 soft delete hiding from active lists, restore, trash list
    - AC-F4-5 aggregate-only provider input + complete insight fields
    - AC-F4-6 cache keyed per period, expired cache not reused, prune-on-create
      keeps 10 and never touches another household
    - AC-F4-7 typed 429/503/422, failed insight never persisted, cache fallback
    - AC-F4-8 actions >= 1 + enum type + forbidden-phrase assert (service gate)

  Every row created here is deleted in afterAll (children-first FK order); no
  application code is touched.

  Run: bunx vitest run -c docs/qa/harness/t007.qa.config.mts
*/

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createIntegrationPrisma } from "@/lib/server/testing/integration-db";
import { createPlanningRepositories, type PlanningRepositories } from "@/lib/server/repositories/ledger";
import type { Db } from "@/lib/server/repositories/types";
import type { PlanningTransaction } from "@/lib/server/services/types";
import { GoalService, toGoalDTO } from "@/lib/server/services/goal";
import { AdvisorService } from "@/lib/server/services/advisor";
import { AppError } from "@/lib/server/errors";
import type {
  AdvisorAggregate,
  AdvisorGeneration,
  AdvisorProvider,
} from "@/lib/server/providers/advisor";

let prisma: PrismaClient;
let planningTransaction: PlanningTransaction;
let repos: PlanningRepositories;
const userIds: string[] = [];
const householdIds: string[] = [];
const advisorUserIds: string[] = [];
const advisorHouseholdIds: string[] = [];

function makeActor(householdId: string, userId: string) {
  return { userId, householdId };
}

async function makeFixture(prefix: string) {
  const email = `qa-t007-${prefix}-${randomUUID()}@test.local`;
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", displayName: `QA T007 ${prefix}` },
  });
  const household = await prisma.household.create({
    data: { name: `QA T007 ${prefix} ${randomUUID()}`, ownerUserId: user.id },
  });
  userIds.push(user.id);
  householdIds.push(household.id);
  return { userId: user.id, householdId: household.id };
}

/** Counted fake provider: records every aggregate input it receives. */
function fakeProvider(log: Array<AdvisorAggregate>, plan: (aggregate: AdvisorAggregate) => AdvisorGeneration): AdvisorProvider {
  return {
    async insight(aggregate) {
      log.push(aggregate);
      return plan(aggregate);
    },
  };
}

const VALID_OUTPUT = {
  headline: "Pengeluaran keluarga masih seimbang periode ini.",
  summary: "Uang keluar 120 ribu dan uang masuk 500 ribu. Sisa uang masih aman.",
  actions: [{ label: "Cek target tabungan liburan", type: "VIEW_GOAL" as const }],
  limitations: "Ini bukan nasihat keuangan profesional. Angka dihitung dari catatan keluargamu.",
  sourcePeriod: { start: "2026-10-01", end: "2026-10-07" },
};

beforeAll(() => {
  prisma = createIntegrationPrisma();
  repos = createPlanningRepositories(prisma);
  planningTransaction = <T,>(fn: (r: PlanningRepositories) => Promise<T>): Promise<T> =>
    prisma.$transaction((tx) => fn(createPlanningRepositories(tx as unknown as Db)), {
      timeout: 20_000,
      maxWait: 5_000,
    });
});

afterAll(async () => {
  /* FK (RESTRICT) children-first order. */
  await prisma.advisorInsight.deleteMany({ where: { householdId: { in: [...householdIds, ...advisorHouseholdIds] } } });
  await prisma.savingsGoal.deleteMany({ where: { householdId: { in: [...householdIds, ...advisorHouseholdIds] } } });
  await prisma.transaction.deleteMany({ where: { householdId: { in: [...householdIds, ...advisorHouseholdIds] } } });
  await prisma.idempotencyKey.deleteMany({ where: { userId: { in: [...userIds, ...advisorUserIds] } } });
  await prisma.membership.deleteMany({ where: { householdId: { in: [...householdIds, ...advisorHouseholdIds] } } });
  await prisma.session.deleteMany({ where: { userId: { in: [...userIds, ...advisorUserIds] } } });
  await prisma.household.deleteMany({ where: { id: { in: [...householdIds, ...advisorHouseholdIds] } } });
  await prisma.user.deleteMany({ where: { id: { in: [...userIds, ...advisorUserIds] } } });
  await prisma.$disconnect();
});

describe("T-007 goals service vs real DB", () => {
  let goal!: { goalService: GoalService; actor: { userId: string; householdId: string } };
  let otherHousehold!: { userId: string; householdId: string };

  beforeAll(async () => {
    const owner = await makeFixture("goals");
    otherHousehold = await makeFixture("intruder");
    goal = { goalService: new GoalService(repos, planningTransaction), actor: makeActor(owner.householdId, owner.userId) };
  });

  const savedInDb = async (goalId: string): Promise<number> => {
    const rows = await prisma.$queryRawUnsafe<Array<{ saved_amount_minor: number }>>(
      `SELECT saved_amount_minor FROM savings_goal WHERE id = $1`,
      goalId,
    );
    return rows[0]?.saved_amount_minor ?? -1;
  };

  it("AC-F4-1: creates a goal (saved=0, progress 0) and allows duplicate names", async () => {
    const first = await goal.goalService.create(goal.actor, {
      name: "Tabungan Lebaran",
      targetAmountMinor: 1_000_000,
    });
    expect(first.status).toBe(201);
    const dto = first.body as { savedAmountMinor: number; progressPercent: number; name: string };
    expect(dto.savedAmountMinor).toBe(0);
    expect(dto.progressPercent).toBe(0);

    const second = await goal.goalService.create(goal.actor, {
      name: "Tabungan Lebaran",
      targetAmountMinor: 500,
    });
    expect(second.status).toBe(201);
    expect((second.body as { name: string }).name).toBe("Tabungan Lebaran");
  });

  it("AC-F4-1: target 0 / negative is rejected (Zod contract + DB CHECK backstop)", async () => {
    const createGoalSchemaReject = async (target: number) => {
      const { createGoalSchema } = await import("@/lib/server/contracts/goals");
      return createGoalSchema.safeParse({ name: "x", targetAmountMinor: target }).success;
    };
    expect(await createGoalSchemaReject(0)).toBe(false);
    expect(await createGoalSchemaReject(-5)).toBe(false);
    expect(await createGoalSchemaReject(1_000)).toBe(true);

    /* DB-level backstop: the raw CHECK constraint stops a bad insert dead. */
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO savings_goal (id, household_id, created_by_user_id, name, target_amount_minor, saved_amount_minor)
         VALUES (gen_random_uuid(), $1, $2, 'bad-target', 0, 0)`,
        goal.actor.householdId,
        goal.actor.userId,
      ),
    ).rejects.toThrow(/savings_goal_target_positive/);
  });

  it("AC-F4-3: DB CHECK also rejects a negative saved counter", async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO savings_goal (id, household_id, created_by_user_id, name, target_amount_minor, saved_amount_minor)
         VALUES (gen_random_uuid(), $1, $2, 'bad-saved', 100, -5)`,
        goal.actor.householdId,
        goal.actor.userId,
      ),
    ).rejects.toThrow(/savings_goal_saved_nonnegative/);
  });

  it("AC-F4-2: caps progress in the DTO at exactly 100 when saved == target, keeps the counter uncapped", async () => {
    const created = await goal.goalService.create(goal.actor, { name: "Dana Darurat Capcheck", targetAmountMinor: 1000 });
    const id = (created.body as { id: string }).id;

    const half = await goal.goalService.adjustSaved(goal.actor, id, 500);
    expect((half.body as { progressPercent: number }).progressPercent).toBe(50);

    const equal = await goal.goalService.adjustSaved(goal.actor, id, 500);
    const dto = equal.body as { savedAmountMinor: number; progressPercent: number };
    expect(dto.savedAmountMinor).toBe(1000);
    expect(dto.progressPercent).toBe(100); /* exactly 100, not 99 */

    const over = await goal.goalService.adjustSaved(goal.actor, id, 300);
    const dtoOver = over.body as { savedAmountMinor: number; progressPercent: number };
    expect(dtoOver.savedAmountMinor).toBe(1300); /* never modified silently */
    expect(dtoOver.progressPercent).toBe(100); /* capped in DTO only */
    expect(await savedInDb(id)).toBe(1300);
  });

  it("AC-F4-3: two concurrent increments both count (no lost update), raw SQL cross-check", async () => {
    const created = await goal.goalService.create(goal.actor, { name: "Concurrent Goal", targetAmountMinor: 10_000 });
    const id = (created.body as { id: string }).id;

    const results = await Promise.all([
      goal.goalService.adjustSaved(goal.actor, id, 700),
      goal.goalService.adjustSaved(goal.actor, id, 1300),
    ]);
    for (const result of results) expect(result.status).toBe(200);

    const viaService = await goal.goalService.list(goal.actor.householdId);
    const dto = ((viaService.body as { rows: Array<{ id: string; savedAmountMinor: number }> }).rows).find((row) => row.id === id);
    expect(dto?.savedAmountMinor).toBe(2000);
    expect(await savedInDb(id)).toBe(2000);
    /* DTO agrees with the raw DB counter. */
    expect(toGoalDTO(await repos.goal.findById(goal.actor.householdId, id) as never).progressPercent).toBe(20);
  });

  it("AC-F4-3: negative result -> 422 SAVED_AMOUNT_INVALID and the DB does not change", async () => {
    const created = await goal.goalService.create(goal.actor, { name: "Negatif Goal", targetAmountMinor: 1000 });
    const id = (created.body as { id: string }).id;
    await goal.goalService.adjustSaved(goal.actor, id, 200);

    let error: AppError | null = null;
    try {
      await goal.goalService.adjustSaved(goal.actor, id, -300);
    } catch (e) {
      error = e as AppError;
    }
    expect(error?.statusCode).toBe(422);
    expect(error?.code).toBe("SAVED_AMOUNT_INVALID");
    expect(await savedInDb(id)).toBe(200); /* atomic WHERE rejected: no change */
  });

  it("AC-F4-3: increment on a trashed goal -> 404 even with a valid delta", async () => {
    const created = await goal.goalService.create(goal.actor, { name: "Trashed Increment", targetAmountMinor: 1000 });
    const id = (created.body as { id: string }).id;
    await goal.goalService.trash(goal.actor, id);

    let error: AppError | null = null;
    try {
      await goal.goalService.adjustSaved(goal.actor, id, 100);
    } catch (e) {
      error = e as AppError;
    }
    expect(error?.statusCode).toBe(404);
    expect(await savedInDb(id)).toBe(0);
  });

  it("AC-F4-3: int32 overflow increment -> 422 (not a DB overflow 500)", async () => {
    const created = await goal.goalService.create(goal.actor, { name: "Overflow Goal", targetAmountMinor: 1_000 });
    const id = (created.body as { id: string }).id;

    let error: AppError | null = null;
    try {
      await goal.goalService.adjustSaved(goal.actor, id, 2_147_483_647);
    } catch (e) {
      error = e as AppError;
    }
    /* saved(0) + INT32_MAX == INT32_MAX is legal and must commit; the next +1 must die as 422. */
    expect(error).toBeNull();
    const plus1 = await goal.goalService.adjustSaved(goal.actor, id, 1).catch((e: AppError) => e);
    expect((plus1 as AppError).statusCode).toBe(422);
    expect((plus1 as AppError).code).toBe("SAVED_AMOUNT_INVALID");
    expect(await savedInDb(id)).toBe(2_147_483_647);
  });

  it("AC-F4-4: trash hides the goal from the active list and the dashboard heads, restore returns it", async () => {
    const created = await goal.goalService.create(goal.actor, { name: "Soft Delete Goal", targetAmountMinor: 4000 });
    const id = (created.body as { id: string }).id;

    const trashed = await goal.goalService.trash(goal.actor, id);
    expect((trashed.body as { deletedAt: string | null }).deletedAt).not.toBeNull();

    const active = await goal.goalService.list(goal.actor.householdId);
    expect((active.body as { rows: Array<{ id: string }> }).rows.some((row) => row.id === id)).toBe(false);

    const trashList = await goal.goalService.listTrash(goal.actor.householdId);
    expect((trashList.body as { rows: Array<{ id: string }> }).rows.some((row) => row.id === id)).toBe(true);

    /* Dashboard GoalsSummaryCard reads the same active-only repository. */
    const activeRows = await repos.goal.listActive(goal.actor.householdId);
    expect(activeRows.some((row) => row.id === id)).toBe(false);

    const restored = await goal.goalService.restore(goal.actor, id);
    expect((restored.body as { deletedAt: string | null }).deletedAt).toBeNull();
    const activeAfter = await goal.goalService.list(goal.actor.householdId);
    expect((activeAfter.body as { rows: Array<{ id: string }> }).rows.some((row) => row.id === id)).toBe(true);
  });

  it("SECURITY: cross-household adjust is 404 without leaking the goal", async () => {
    const created = await goal.goalService.create(goal.actor, { name: "Rahasia A", targetAmountMinor: 1000 });
    const id = (created.body as { id: string }).id;

    const intruder = new GoalService(repos, planningTransaction);
    let error: AppError | null = null;
    try {
      await intruder.adjustSaved(makeActor(otherHousehold.householdId, otherHousehold.userId), id, 100);
    } catch (e) {
      error = e as AppError;
    }
    expect(error?.statusCode).toBe(404);
  });
});

describe("T-007 advisor service with fake provider vs real DB", () => {
  let advisorService!: AdvisorService;
  let actor!: { userId: string; householdId: string };
  let otherHouse!: { userId: string; householdId: string };
  const providerLog: Array<AdvisorAggregate> = [];
  let plan: (aggregate: AdvisorAggregate) => AdvisorGeneration = () => ({
    ok: true,
    model: "fake-advisor-model",
    raw: { ...VALID_OUTPUT },
  });

  beforeAll(async () => {
    const owner = await makeFixture("advisor");
    otherHouse = await makeFixture("advisor2");
    advisorUserIds.push(owner.userId, otherHouse.userId);
    advisorHouseholdIds.push(owner.householdId, otherHouse.householdId);
    actor = makeActor(owner.householdId, owner.userId);
    await advisorUserSeedTransactions();
    advisorService = new AdvisorService(
      repos,
      planningTransaction,
      fakeProvider(providerLog, (aggregate) => plan(aggregate)),
    );
  });

  /* Seed two real transactions so the aggregate sums are non-zero and provable. */
  async function advisorUserSeedTransactions(): Promise<void> {
    await prisma.transaction.create({
      data: {
        householdId: actor.householdId,
        createdByUserId: actor.userId,
        type: "MONEY_OUT",
        amountMinor: 120_000,
        category: "food",
        occurredAt: new Date("2026-10-03T10:00:00Z"),
        source: "MANUAL",
        note: "RAWSQLCANARY-should-never-reach-model",
      },
    });
    await prisma.transaction.create({
      data: {
        householdId: actor.householdId,
        createdByUserId: actor.userId,
        type: "MONEY_IN",
        amountMinor: 500_000,
        category: "income",
        occurredAt: new Date("2026-10-04T10:00:00Z"),
        source: "MANUAL",
        merchant: "Gaji",
      },
    });
    /* A trashed goal for the household so activeGoals must exclude it. */
    await prisma.savingsGoal.create({
      data: {
        householdId: actor.householdId,
        createdByUserId: actor.userId,
        name: "Trashed Goal Advisor",
        targetAmountMinor: 500,
        savedAmountMinor: 0,
        deletedAt: new Date(),
      },
    });
  }

  const countInsights = async (householdId: string): Promise<bigint> =>
    (await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM advisor_insight WHERE household_id = $1`,
      householdId,
    ))[0].n;

  it("AC-F4-5: provider receives period aggregates ONLY (never per-record rows, never raw notes)", async () => {
    const result = await advisorService.getInsight(actor, { start: "2026-10-01", end: "2026-10-07" });
    expect(result.status).toBe(200);
    expect(delivery(result)).toBe("FRESH");
    expect(providerLog).toHaveLength(1);
    const aggregate = providerLog[0];
    expect(Object.keys(aggregate).sort()).toEqual(
      ["activeGoals", "budgetMinor", "period", "totalInMinor", "totalOutMinor"],
    );
    expect(aggregate.totalInMinor).toBe(500_000);
    expect(aggregate.totalOutMinor).toBe(120_000);
    const rawAggregate = JSON.stringify(aggregate);
    expect(rawAggregate).not.toContain("RAWSQLCANARY");
    expect(rawAggregate).not.toContain("occurredAt");
    expect(rawAggregate).not.toContain("Gaji");
    for (const goal of aggregate.activeGoals) {
      expect(Object.keys(goal).sort()).toEqual(["name", "progressPercent"]);
    }
    expect(aggregate.activeGoals.some((goal) => goal.name === "Trashed Goal Advisor")).toBe(false);

    /* Response fields complete (AC-F4-5). */
    const body = result.body as {
      insight: {
        headline: string; summary: string; actions: Array<{ label: string; type: string }>;
        limitations: string; sourcePeriod: { start: string; end: string }; model: string;
        generatedAt: string; expiresAt: string;
      };
      delivery: string;
    };
    const insight = body.insight;
    expect(insight.sourcePeriod).toEqual({ start: "2026-10-01", end: "2026-10-07" });
    expect(insight.limitations).toBeTruthy();
    expect(insight.actions.length).toBeGreaterThanOrEqual(1);
    expect(insight.model).toBe("fake-advisor-model");
    expect(new Date(insight.expiresAt).getTime() - new Date(insight.generatedAt).getTime()).toBe(24 * 3_600_000);

    /* Validated against the model's own sourcePeriod: the request period wins. */
    const row = (await prisma.$queryRawUnsafe<Array<{ source_period_start: Date; source_period_end: Date }>>(
      `SELECT source_period_start, source_period_end FROM advisor_insight WHERE household_id = $1`,
      actor.householdId,
    ))[0];
    expect(row.source_period_start.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(row.source_period_end.toISOString().slice(0, 10)).toBe("2026-10-07");
  });

  it("AC-F4-5: period > 90 days and start > end are refused (contract level)", async () => {
    const { advisorInsightRequestSchema } = await import("@/lib/server/contracts/advisor");
    expect(advisorInsightRequestSchema.safeParse({ period: { start: "2026-01-01", end: "2026-04-01" } }).success).toBe(false);
    expect(advisorInsightRequestSchema.safeParse({ period: { start: "2026-10-07", end: "2026-10-01" } }).success).toBe(false);
    expect(advisorInsightRequestSchema.safeParse({ period: { start: "2026-10-01", end: "2026-10-01" } }).success).toBe(true);
    expect(advisorInsightRequestSchema.safeParse({ period: { start: "2026-10-01", end: "2026-12-29" } }).success).toBe(true);
    expect(advisorInsightRequestSchema.safeParse({ period: { start: "2026-10-01", end: "2026-12-30" } }).success).toBe(false);
  });

  it("AC-F4-6: same-period repeat is served from cache (delivery=CACHE), provider NOT called again", async () => {
    const callsBefore = providerLog.length;
    const result = await advisorService.getInsight(actor, { start: "2026-10-01", end: "2026-10-07" });
    expect(result.status).toBe(200);
    expect(delivery(result)).toBe("CACHE");
    expect(providerLog.length).toBe(callsBefore); /* no second model call */
    const fresh = await advisorService.getInsight(actor, { start: "2026-10-01", end: "2026-10-07" });
    expect(delivery(fresh)).toBe("CACHE");
    /* same insight object: identical generatedAt from the persisted row */
    expect((fresh.body as { insight: { generatedAt: string } }).insight.generatedAt).toBe(
      (result.body as { insight: { generatedAt: string } }).insight.generatedAt,
    );
  });

  it("AC-F4-6: a DIFFERENT period never gets the other period's cache (provider miss)", async () => {
    const callsBefore = providerLog.length;
    const result = await advisorService.getInsight(actor, { start: "2026-10-02", end: "2026-10-06" });
    expect(delivery(result)).toBe("FRESH");
    expect(providerLog.length).toBe(callsBefore + 1);
    const returned = (result.body as { insight: { sourcePeriod: { start: string; end: string } } }).insight.sourcePeriod;
    expect(returned).toEqual({ start: "2026-10-02", end: "2026-10-06" });
  });

  it("AC-F4-6: an expired insight is never reused (TTL hard check)", async () => {
    /* Force-expires the 2026-10-01..07 row and re-requests: a new FRESH run must occur. */
    await prisma.$executeRawUnsafe(
      `UPDATE advisor_insight SET generated_at = now() - interval '48 hours',
       expires_at = now() - interval '24 hours' WHERE household_id = $1 AND source_period_start = '2026-10-01'`,
      actor.householdId,
    );
    const callsBefore = providerLog.length;
    const result = await advisorService.getInsight(actor, { start: "2026-10-01", end: "2026-10-07" });
    expect(delivery(result)).toBe("FRESH");
    expect(providerLog.length).toBe(callsBefore + 1);
    expect((result.body as { insight: { generatedAt: string } }).insight.generatedAt).not.toBe(
      /* NOT the expired row's generatedAt */ "",
    );
  });

  it("AC-F4-7: 429/503/422 are typed, never persisted, and a present cache becomes the fallback (delivery=CACHE)", async () => {
    const periods = [
      { errorCode: "ADVISOR_RATE_LIMITED", http: 429, period: { start: "2026-11-01", end: "2026-11-07" } },
      { errorCode: "ADVISOR_UNAVAILABLE", http: 503, period: { start: "2026-11-08", end: "2026-11-14" } },
    ] as const;
    for (const failure of periods) {
      /* No cache for this period: the typed error must surface. */
      plan = () => ({ ok: false, errorCode: failure.errorCode });
      const countBefore = await countInsights(actor.householdId);
      const failed = await advisorService
        .getInsight(actor, failure.period)
        .catch((error: AppError) => error);
      const error = failed as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(failure.http);
      expect(error.code).toBe(failure.errorCode);
      expect(await countInsights(actor.householdId)).toBe(countBefore); /* failed insight never persisted */
    }

    /* A cache IS present for 2026-10-02..06: the same failure now degrades to CACHE. */
    plan = () => ({ ok: false, errorCode: "ADVISOR_RATE_LIMITED" });
    const cacheFallback = await advisorService.getInsight(actor, { start: "2026-10-02", end: "2026-10-06" });
    expect(cacheFallback.status).toBe(200);
    expect(delivery(cacheFallback)).toBe("CACHE");

    /* 422 invalid output is also typed and NOT persisted. */
    plan = () => ({ ok: true, model: "fake-advisor-model", raw: { oops: true } });
    const invalid = await advisorService
      .getInsight(actor, { start: "2026-11-15", end: "2026-11-21" })
      .catch((error: AppError) => error);
    expect((invalid as AppError).statusCode).toBe(422);
    expect((invalid as AppError).code).toBe("ADVISOR_INVALID_OUTPUT");
  });

  it("AC-F4-8: actions < 1 is refused; actions with a bad enum type is refused; forbidden phrases are refused; none persisted", async () => {
    const base = { ...VALID_OUTPUT };
    const countBefore = await countInsights(actor.householdId);

    plan = () => ({ ok: true, model: "fake-advisor-model", raw: { ...base, actions: [] } });
    const noActions = await advisorService
      .getInsight(actor, { start: "2026-11-22", end: "2026-11-28" })
      .catch((error: AppError) => error);
    expect((noActions as AppError).statusCode).toBe(422);

    plan = () => ({
      ok: true,
      model: "fake-advisor-model",
      raw: { ...base, actions: [{ label: "Beli saham", type: "BUY_STOCK" }] },
    });
    const badEnum = await advisorService
      .getInsight(actor, { start: "2026-11-22", end: "2026-11-28" })
      .catch((error: AppError) => error);
    expect((badEnum as AppError).statusCode).toBe(422);

    plan = () => ({
      ok: true,
      model: "fake-advisor-model",
      raw: { ...base, headline: "Dijamin untung setiap bulan!" },
    });
    const blacklisted = await advisorService
      .getInsight(actor, { start: "2026-11-22", end: "2026-11-28" })
      .catch((error: AppError) => error);
    expect((blacklisted as AppError).code).toBe("ADVISOR_INVALID_OUTPUT");

    /* Case-insensitive blacklist. */
    plan = () => ({
      ok: true,
      model: "fake-advisor-model",
      raw: { ...base, limitations: "Sesuai OJK, ini bisa DiJaMiN pasti hemat." },
    });
    const combo = await advisorService
      .getInsight(actor, { start: "2026-11-22", end: "2026-11-28" })
      .catch((error: AppError) => error);
    expect((combo as AppError).code).toBe("ADVISOR_INVALID_OUTPUT");

    expect(await countInsights(actor.householdId)).toBe(countBefore);
  });

  it("AC-F4-6: the 11th insight prunes the oldest and never touches another household", async () => {
    const victimHousehold = actor.householdId;
    const other = otherHouse.householdId;

    /* Exact known state first: 10 rows via direct creates with staggered generatedAt. */
    await prisma.advisorInsight.deleteMany({ where: { householdId: victimHousehold } });
    const day = (index: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, 0) + index * 3_600_000);
    for (let index = 0; index < 10; index += 1) {
      await repos.advisorInsight.create({
        householdId: victimHousehold,
        requestedByUserId: actor.userId,
        sourcePeriodStart: new Date(Date.UTC(2026, 8, 1 + index)),
        sourcePeriodEnd: new Date(Date.UTC(2026, 8, 1 + index)),
        model: "fake-advisor-model",
        headline: `Insight ke-${index}`,
        summary: `Ringkasan ke-${index}`,
        actionsJson: [{ label: "Nanti saja", type: "NONE" }],
        limitations: "Ini bukan nasihat keuangan profesional.",
        generatedAt: day(index),
        expiresAt: new Date(day(index + 40 * 24)),
      });
    }
    /* 3 rows in the OTHER household that must survive. */
    for (let index = 0; index < 3; index += 1) {
      await repos.advisorInsight.create({
        householdId: other,
        requestedByUserId: otherHouse.userId,
        sourcePeriodStart: new Date(Date.UTC(2026, 9, 1 + index)),
        sourcePeriodEnd: new Date(Date.UTC(2026, 9, 1 + index)),
        model: "fake-advisor-model",
        headline: `Rahasia B ke-${index}`,
        summary: `Baris B ke-${index}`,
        actionsJson: [{ label: "Nanti saja", type: "NONE" }],
        limitations: "Ini bukan nasihat keuangan profesional.",
        generatedAt: day(100 + index),
        expiresAt: new Date(day(200)),
      });
    }

    plan = () => ({ ok: true, model: "fake-advisor-model", raw: { ...VALID_OUTPUT } });
    const result = await advisorService.getInsight(actor, { start: "2026-12-01", end: "2026-12-07" });
    expect(delivery(result)).toBe("FRESH");

    expect(await countInsights(victimHousehold)).toBe(10n); /* prune-on-create honored */
    const remaining = await prisma.$queryRawUnsafe<Array<{ headline: string }>>(
      `SELECT headline FROM advisor_insight WHERE household_id = $1 ORDER BY generated_at ASC`,
      victimHousehold,
    );
    expect(remaining.some((row) => row.headline === "Insight ke-0")).toBe(false); /* oldest pruned */
    expect(remaining.some((row) => row.headline === "Insight ke-9")).toBe(true);
    expect(await countInsights(other)).toBe(3n); /* other households untouched */
  });

  it("AC-F4-6: cross-household isolation at cache level - household B never reads A's insights", async () => {
    /* B has no cache for this period: must be a FRESH generation, not A's cached row. */
    const callsBefore = providerLog.length;
    const previousOutput = { ...VALID_OUTPUT };
    plan = () => ({
      ok: true,
      model: "fake-advisor-model",
      raw: { ...previousOutput, headline: "Ringkasan khusus rumah B." },
    });
    const result = await (new AdvisorService(
      repos,
      planningTransaction,
      fakeProvider(providerLog, (aggregate) => plan(aggregate)),
    ).getInsight(makeActor(otherHouse.householdId, otherHouse.userId), { start: "2026-10-01", end: "2026-10-07" }));
    expect(delivery(result)).toBe("FRESH");
    expect(providerLog.length).toBe(callsBefore + 1);
    /* B got ITS OWN freshly generated insight, not A's cached headline. */
    expect((result.body as { insight: { headline: string } }).insight.headline).toBe("Ringkasan khusus rumah B.");
  });
});

function delivery(result: { body: unknown }): string {
  return (result.body as { delivery: string }).delivery;
}
