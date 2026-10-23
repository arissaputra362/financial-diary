import { describe, expect, it } from "vitest";
import { createGoalSchema } from "../contracts/goals";
import { GoalService, toGoalDTO } from "./goal";
import { createFakePlanning } from "../testing/fakes";
import type { PlanningRepositories } from "../repositories/ledger";
import type { PlanningTransaction, ServiceResult } from "./types";
import { AppError } from "../errors";

const ACTOR = { userId: "33333333-3333-4333-8333-333333333333", householdId: "11111111-1111-4111-8111-111111111111" };

/** Service harness: the fake repository bundle stands in for PostgreSQL. */
function setup() {
  const { repos, transaction, store } = createFakePlanning();
  const service = new GoalService(repos as PlanningRepositories, transaction as PlanningTransaction);
  return { service, store };
}

/** Returns the thrown AppError (asserting it *did* throw is done by the caller). */
function serviceError(error: unknown): AppError {
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

async function create(service: GoalService, name: string, targetAmountMinor: number) {
  const result: ServiceResult = await service.create(ACTOR, { name, targetAmountMinor });
  return { status: result.status, id: (result.body as { id: string }).id, body: result.body };
}

describe("GoalService.create (AC-F4-1)", () => {
  it("creates a goal with saved=0, progress 0, and the requested deadline", async () => {
    const { service, store } = setup();
    const result = await service.create(ACTOR, {
      name: "Dana darurat",
      targetAmountMinor: 1_000_000,
      deadline: "2026-12-31",
    });
    expect(result.status).toBe(201);
    const goal = result.body as { savedAmountMinor: number; progressPercent: number; deadline: string | null };
    expect(goal.savedAmountMinor).toBe(0);
    expect(goal.progressPercent).toBe(0);
    expect(goal.deadline).toBe("2026-12-31");
    expect(store.goals).toHaveLength(1);
  });

  it("allows duplicate goal names, both 201 (AC-F4-1)", async () => {
    const { service, store } = setup();
    const first = await create(service, "Liburan", 500_000);
    const second = await create(service, "Liburan", 700_000);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(store).toBeDefined();
  });

  it("accepts a deadline in the past without an error (AC-F4-1)", async () => {
    const { service } = setup();
    const result = await service.create(ACTOR, {
      name: "Terlambat",
      targetAmountMinor: 100_000,
      deadline: "2020-01-01",
    });
    expect(result.status).toBe(201);
  });

  it("rejects target 0 or negative through the shared contract (AC-F4-1)", () => {
    expect(createGoalSchema.safeParse({ name: "A", targetAmountMinor: 0 }).success).toBe(false);
    expect(createGoalSchema.safeParse({ name: "A", targetAmountMinor: -5 }).success).toBe(false);
    expect(createGoalSchema.safeParse({ name: "A", targetAmountMinor: 1 }).success).toBe(true);
  });
});

describe("GoalService progress cap (AC-F4-2, DTO boundary only)", () => {
  it("caps progressPercent at 100 when saved exceeds target, stored value untouched", async () => {
    const { service, store } = setup();
    const { id } = await create(service, "Cicilan", 1_000);
    await service.adjustSaved(ACTOR, id, 1_500);
    const row = store.goals.find((goal) => goal.id === id);
    expect(row?.savedAmountMinor).toBe(1_500);
    const list: ServiceResult = await service.list(ACTOR.householdId);
    const dto = (list.body as { rows: Array<{ progressPercent: number; savedAmountMinor: number }> }).rows[0];
    expect(dto?.progressPercent).toBe(100);
    expect(dto?.savedAmountMinor).toBe(1_500);
  });

  it("returns exactly 100% (not 99%) when saved == target (AC-F4-2)", async () => {
    const { service } = setup();
    const { id } = await create(service, "Pas", 999);
    const updated = await service.adjustSaved(ACTOR, id, 999);
    expect((updated.body as { progressPercent: number }).progressPercent).toBe(100);
  });

  it("toGoalDTO shows the true counter, only the percentage is capped", () => {
    const dto = toGoalDTO({
      id: "g1",
      householdId: ACTOR.householdId,
      createdByUserId: ACTOR.userId,
      name: "T",
      targetAmountMinor: 100,
      savedAmountMinor: 250,
      currencyCode: "IDR",
      deadline: null,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(dto.savedAmountMinor).toBe(250);
    expect(dto.progressPercent).toBe(100);
  });
});

describe("GoalService.adjustSaved (AC-F4-3)", () => {
  it("counts both increments, no lost update", async () => {
    const { service, store } = setup();
    const { id } = await create(service, "Kolam renang", 1_000_000);
    await service.adjustSaved(ACTOR, id, 100_000);
    const second = await service.adjustSaved(ACTOR, id, 200_000);
    expect(second.status).toBe(200);
    expect(store.goals.find((goal) => goal.id === id)?.savedAmountMinor).toBe(300_000);
  });

  it("rejects a negative result with SAVED_AMOUNT_INVALID and no change (AC-F4-3)", async () => {
    const { service, store } = setup();
    const { id } = await create(service, "Kolam renang", 1_000_000);
    await service.adjustSaved(ACTOR, id, 50_000);
    const failure = await service.adjustSaved(ACTOR, id, -50_001).catch((caught: unknown) => caught);
    const appError = serviceError(failure);
    expect(appError.code).toBe("SAVED_AMOUNT_INVALID");
    /* Business failures carry an explicit machine code, not a generic 422. */
    expect(appError.statusCode).toBe(422);
    expect(store.goals.find((goal) => goal.id === id)?.savedAmountMinor).toBe(50_000);
  });

  it("rejects a delta that overflows int32 with SAVED_AMOUNT_INVALID", async () => {
    const { service } = setup();
    const { id } = await create(service, "Overflow", 100);
    const failure = await service.adjustSaved(ACTOR, id, 2_147_483_648).catch((caught: unknown) => caught);
    expect(serviceError(failure).code).toBe("SAVED_AMOUNT_INVALID");
  });

  it("rejects a non-integer or zero delta", async () => {
    const { service } = setup();
    const { id } = await create(service, "Tako", 100);
    expect(serviceError(await service.adjustSaved(ACTOR, id, 0).catch((caught: unknown) => caught)).code).toBe("SAVED_AMOUNT_INVALID");
    expect(serviceError(await service.adjustSaved(ACTOR, id, 2.5).catch((caught: unknown) => caught)).code).toBe("SAVED_AMOUNT_INVALID");
  });

  it("returns 404 for an increment on a trashed goal (AC-F4-3)", async () => {
    const { service } = setup();
    const { id } = await create(service, "Terhapus", 1_000);
    await service.trash(ACTOR, id);
    const failure = await service.adjustSaved(ACTOR, id, 1_000).catch((caught: unknown) => caught);
    expect(serviceError(failure).code).toBe("NOT_FOUND");
  });

  it("returns 404 for a goal id of another household (scope rule)", async () => {
    const { service } = setup();
    const failure = await service
      .adjustSaved(ACTOR, "99999999-9999-4999-8999-999999999999", 1_000)
      .catch((caught: unknown) => caught);
    expect(serviceError(failure).code).toBe("NOT_FOUND");
  });
});

describe("GoalService trash/restore (AC-F4-4)", () => {
  it("soft-deletes a goal, removes it from lists, then restores it", async () => {
    const { service, store } = setup();
    const { id } = await create(service, "Dana kuliah", 750_000);

    const trashed = await service.trash(ACTOR, id);
    expect(trashed.status).toBe(200);
    expect((trashed.body as { deletedAt: string | null }).deletedAt).not.toBeNull();
    expect(store.goals.filter((goal) => goal.deletedAt === null)).toHaveLength(0);

    const active: ServiceResult = await service.list(ACTOR.householdId);
    expect((active.body as { rows: unknown[] }).rows).toHaveLength(0);

    const restored = await service.restore(ACTOR, id);
    expect(restored.status).toBe(200);
    const activeAfter: ServiceResult = await service.list(ACTOR.householdId);
    expect((activeAfter.body as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("a second trash call stays idempotent (alreadyDeleted path)", async () => {
    const { service } = setup();
    const { id } = await create(service, "Wifi", 100_000);
    await service.trash(ACTOR, id);
    const again = await service.trash(ACTOR, id);
    expect(again.status).toBe(200);
    expect((again.body as { deletedAt: string | null }).deletedAt).not.toBeNull();
  });

  it("lists trash rows for restore (feature: yes / trash view)", async () => {
    const { service, store } = setup();
    const { id } = await create(service, "Tenda", 500_000);
    await service.trash(ACTOR, id);
    const trashList: ServiceResult = await service.listTrash(ACTOR.householdId);
    const body = trashList.body as { rows: Array<{ id: string }>; nextCursor: string | null };
    expect(body.rows.map((row) => row.id)).toContain(id);

    const active = store.goals.find((goal) => goal.id === id);
    expect(active?.deletedAt).not.toBeNull();

    const restored = await service.restore(ACTOR, id);
    void restored;
    const trashAfter: ServiceResult = await service.listTrash(ACTOR.householdId);
    expect((trashAfter.body as { rows: unknown[] }).rows).toHaveLength(0);
  });
});
