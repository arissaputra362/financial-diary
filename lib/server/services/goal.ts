/*
  GoalService (AC-F4-1..AC-F4-4, A-11/16, D-18, ADR-006).

  Business rules live here: target > 0, duplicate names allowed (no uniqueness
  rule anywhere), past deadlines allowed (the UI shows the late badge), and
  delta-based saved adjustments through the atomic conditional repository
  update. Response DTOs cap `progressPercent` at 100; the stored counter is
  never capped. Writes are soft delete only; POST create supports
  Idempotency-Key with claim -> mutation -> commit precedence (A-11).
*/

import { computeRequestHash, IdempotencyService } from "./idempotency";
import { notFound, unprocessableCode } from "../errors";
import type { PlanningRepositories } from "../repositories/ledger";
import type { GoalRecord } from "../repositories/ledger";
import type { CreateGoalInput } from "../contracts/goals";
import type { GoalDTO, GoalListDTO } from "@/types/api";
import type { PlanningTransaction, ServiceResult } from "./types";

const INT32_MAX = 2_147_483_647;
const GOALS_PATH = "/api/goals";

/** Prune/restore semantics come from the rows; money edits are valid up to int32. */
export type GoalActor = { userId: string; householdId: string };

/** `min(100, saved / target * 100)` computed only at the DTO boundary (AC-F4-2). */
export function goalProgressPercent(savedAmountMinor: number, targetAmountMinor: number): number {
  if (targetAmountMinor <= 0) return 0;
  return Math.min(100, Math.round((savedAmountMinor / targetAmountMinor) * 100));
}

export function toGoalDTO(row: GoalRecord): GoalDTO {
  return {
    id: row.id,
    name: row.name,
    targetAmountMinor: row.targetAmountMinor,
    savedAmountMinor: row.savedAmountMinor,
    currencyCode: row.currencyCode,
    deadline: row.deadline ? row.deadline.toISOString().slice(0, 10) : null,
    progressPercent: goalProgressPercent(row.savedAmountMinor, row.targetAmountMinor),
    createdByUserId: row.createdByUserId,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class GoalService {
  private readonly idempotency: IdempotencyService<PlanningRepositories>;

  constructor(
    private readonly repos: PlanningRepositories,
    private readonly transaction: PlanningTransaction,
  ) {
    this.idempotency = new IdempotencyService<PlanningRepositories>(transaction);
  }

  create(actor: GoalActor, input: CreateGoalInput, idempotencyKey?: string): Promise<ServiceResult> {
    const deadline = input.deadline ? new Date(`${input.deadline}T00:00:00.000Z`) : null;

    const run = (repos: PlanningRepositories) =>
      this.persistCreate(repos, actor, input, deadline);

    if (idempotencyKey) {
      const hash = computeRequestHash("POST", GOALS_PATH, {
        name: input.name,
        targetAmountMinor: input.targetAmountMinor,
        deadline: input.deadline ?? null,
      });
      return this.idempotency.run(actor.userId, idempotencyKey, hash, run);
    }
    return this.transaction(run);
  }

  private async persistCreate(
    repos: PlanningRepositories,
    actor: GoalActor,
    input: CreateGoalInput,
    deadline: Date | null,
  ): Promise<ServiceResult> {
    /* Duplicate names are allowed by design (AC-F4-1): no uniqueness check. */
    const row = await repos.goal.create({
      householdId: actor.householdId,
      createdByUserId: actor.userId,
      name: input.name,
      targetAmountMinor: input.targetAmountMinor,
      deadline,
    });
    return { status: 201, body: toGoalDTO(row) satisfies GoalDTO };
  }

  async list(householdId: string): Promise<ServiceResult> {
    const rows = await this.repos.goal.listActive(householdId);
    return {
      status: 200,
      body: { rows: rows.map(toGoalDTO), nextCursor: null } satisfies GoalListDTO,
    };
  }

  async adjustSaved(actor: GoalActor, id: string, savedDelta: number): Promise<ServiceResult> {
    /*
      Delta must be a non-zero integer within int32 (Zod at the route already
      enforces shape); the service guards the stored value range so a huge delta
      dies as 422 instead of an int overflow inside PostgreSQL (spec edge case).
    */
    if (!Number.isInteger(savedDelta) || savedDelta === 0 || Math.abs(savedDelta) > INT32_MAX) {
      throw unprocessableCode("SAVED_AMOUNT_INVALID", { savedDelta: ["Jumlah perubahan tidak valid."] });
    }

    const householdId = actor.householdId;
    const before = await this.repos.goal.findById(householdId, id);
    /* Trashed goals are invisible to the API: increment on one is a 404 (AC-F4-3). */
    if (!before || before.deletedAt !== null) throw notFound("Target tidak ditemukan.");

    if (before.savedAmountMinor + savedDelta > INT32_MAX) {
      throw unprocessableCode("SAVED_AMOUNT_INVALID", { savedDelta: ["Jumlah terlalu besar."] });
    }

    const applied = await this.repos.goal.incrementSaved(householdId, id, savedDelta);
    if (applied === 0) {
      /* Rowcount 0 here means the WHERE rejected a negative result; no change happened. */
      throw unprocessableCode("SAVED_AMOUNT_INVALID", {
        savedDelta: ["Saldo target tidak boleh minus."],
      });
    }

    const fresh = await this.repos.goal.findById(householdId, id);
    if (!fresh) throw notFound("Target tidak ditemukan.");
    return { status: 200, body: toGoalDTO(fresh) satisfies GoalDTO };
  }

  async trash(actor: GoalActor, id: string): Promise<ServiceResult> {
    await this.repos.goal.softDelete(actor.householdId, id, actor.userId);
    const row = await this.repos.goal.findById(actor.householdId, id);
    if (!row) throw notFound("Target tidak ditemukan.");
    return { status: 200, body: toGoalDTO(row) satisfies GoalDTO };
  }

  async restore(actor: GoalActor, id: string): Promise<ServiceResult> {
    const result = await this.repos.goal.restore(actor.householdId, id);
    const row = await this.repos.goal.findById(actor.householdId, id);
    if (!row) throw notFound("Target tidak ditemukan.");
    return {
      status: 200,
      body: { ...toGoalDTO(row), alreadyActive: result.alreadyActive },
    };
  }

  async listTrash(householdId: string, cursor?: string | null, limit?: number): Promise<ServiceResult> {
    const page = await this.repos.goal.listTrash(householdId, cursor ?? null, limit ?? 20);
    return {
      status: 200,
      body: { rows: page.rows.map(toGoalDTO), nextCursor: page.nextCursor },
    };
  }
}
