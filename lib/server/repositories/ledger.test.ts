import { describe, expect, it, vi } from "vitest";
import { createTransactionRepository, createGoalRepository } from "./ledger";
import type { Db } from "./types";

/*
  Repository unit tests use a mock Prisma client (Keputusan Teknis T-003).
  The mock records the `where` clause of every call so the tests can assert the
  two mandatory rules: household scoping and soft-delete exclusion.
*/

type CapturedWhere = Record<string, unknown>;
type Captured = {
  transactionWhere?: CapturedWhere;
  transactionOrderBy?: unknown;
  goalWhere?: CapturedWhere;
};

function makeDb() {
  const captured: Captured = {};
  const db = {
    transaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "tx-1",
        type: data.type,
        amountMinor: data.amountMinor,
        transferGroupId: data.transferGroupId ?? null,
      })),
      findFirst: vi.fn(async ({ where }: { where: CapturedWhere }) => {
        captured.transactionWhere = where;
        return { id: "tx-1", householdId: where.householdId, deletedAt: null };
      }),
      findMany: vi.fn(async ({ where, orderBy }: { where: CapturedWhere; orderBy?: unknown }) => {
        captured.transactionWhere = where;
        captured.transactionOrderBy = orderBy;
        return [];
      }),
      aggregate: vi.fn(async ({ where }: { where: CapturedWhere }) => {
        captured.transactionWhere = where;
        return { _sum: { amountMinor: 1000 } };
      }),
      groupBy: vi.fn(async ({ where }: { where: CapturedWhere }) => {
        captured.transactionWhere = where;
        return [];
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        transaction: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: `tx-${data.type}`,
            type: data.type,
            amountMinor: data.amountMinor,
            transferGroupId: data.transferGroupId,
          })),
        },
      }),
    ),
    savingsGoal: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "goal-1",
        name: data.name,
        targetAmountMinor: data.targetAmountMinor,
        savedAmountMinor: 0,
      })),
      findFirst: vi.fn(async ({ where }: { where: CapturedWhere }) => {
        captured.goalWhere = where;
        return { id: "goal-1", householdId: where.householdId, deletedAt: null, savedAmountMinor: 100 };
      }),
      findMany: vi.fn(async ({ where }: { where: CapturedWhere }) => {
        captured.goalWhere = where;
        return [];
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as unknown as Db;
  return { db, captured };
}

const HOUSEHOLD_A = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD_B = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const WALLET = "66666666-6666-4666-8666-666666666666";
const actorA = { userId: USER, householdId: HOUSEHOLD_A, role: "OWNER" };

describe("TransactionRepository", () => {
  it("excludes soft-deleted rows from active queries (AC)", () => {
    const { db, captured } = makeDb();
    createTransactionRepository(db).listActive(actorA);
    expect(captured.transactionWhere).toMatchObject({
      householdId: HOUSEHOLD_A,
      deletedAt: null,
    });
  });

  it("scopes listActive to the given household", () => {
    const { db, captured } = makeDb();
    createTransactionRepository(db).listActive({ ...actorA, householdId: HOUSEHOLD_B }, { type: "MONEY_OUT" });
    expect(captured.transactionWhere).toMatchObject({
      householdId: HOUSEHOLD_B,
      type: "MONEY_OUT",
      deletedAt: null,
    });
  });

  it("orders activity by transaction date, creation time, then id", async () => {
    const { db, captured } = makeDb();
    await createTransactionRepository(db).listActive(actorA);
    expect(captured.transactionOrderBy).toEqual([
      { occurredAt: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("scopes sumByType and listByDay to the household and active rows", () => {
    const { db, captured } = makeDb();
    const repo = createTransactionRepository(db);
    const range = { from: new Date("2026-10-01"), to: new Date("2026-10-31") };
    repo.sumByType(HOUSEHOLD_A, { type: "MONEY_OUT", ...range });
    expect(captured.transactionWhere).toMatchObject({
      householdId: HOUSEHOLD_A,
      type: "MONEY_OUT",
      deletedAt: null,
    });
    repo.listByDay(HOUSEHOLD_A, range);
    expect(captured.transactionWhere).toMatchObject({
      householdId: HOUSEHOLD_A,
      type: "MONEY_OUT",
      deletedAt: null,
    });
  });

  it("denies cross-household reads by id (extended-unique where)", async () => {
    const { db, captured } = makeDb();
    await createTransactionRepository(db).findById(actorA, "tx-1");
    expect(captured.transactionWhere).toMatchObject({
      id: "tx-1",
      householdId: HOUSEHOLD_A,
    });
  });

  it("soft-deletes only within the household scope", async () => {
    const { db } = makeDb();
    const updateMany = db.transaction.updateMany as ReturnType<typeof vi.fn>;
    await createTransactionRepository(db).softDelete(actorA, "tx-1", USER);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "tx-1", householdId: HOUSEHOLD_A, deletedAt: null }),
      }),
    );
  });

  it("restores only soft-deleted rows within the household scope", async () => {
    const { db } = makeDb();
    const updateMany = db.transaction.updateMany as ReturnType<typeof vi.fn>;
    await createTransactionRepository(db).restore(actorA, "tx-1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "tx-1", householdId: HOUSEHOLD_A, deletedAt: { not: null } }),
      }),
    );
  });

  it("lists trash rows only (deleted_at not null), separate from active reads", () => {
    const { db, captured } = makeDb();
    createTransactionRepository(db).listTrash(actorA);
    expect(captured.transactionWhere).toMatchObject({
      householdId: HOUSEHOLD_A,
      deletedAt: { not: null },
    });
  });

  it("creates a transfer pair with one shared transfer_group_id in one transaction", async () => {
    const { db } = makeDb();
    const legs = await createTransactionRepository(db).createTransferPair(
      HOUSEHOLD_A,
      USER,
      { amountMinor: 50_000, occurredAt: new Date("2026-10-01T12:00:00+07:00"), walletId: WALLET },
      { amountMinor: 50_000, occurredAt: new Date("2026-10-01T12:00:00+07:00"), walletId: "77777777-7777-4777-8777-777777777777" },
    );
    expect(legs).toHaveLength(2);
    expect(legs[0]?.transferGroupId).toBe(legs[1]?.transferGroupId);
    expect(legs[0]?.type).toBe("MONEY_OUT");
    expect(legs[1]?.type).toBe("MONEY_IN");
    expect(vi.mocked(db.$transaction)).toHaveBeenCalledOnce();
  });
});

describe("GoalRepository", () => {
  it("excludes soft-deleted goals from active queries (AC)", () => {
    const { db, captured } = makeDb();
    createGoalRepository(db).listActive(HOUSEHOLD_A);
    expect(captured.goalWhere).toMatchObject({
      householdId: HOUSEHOLD_A,
      deletedAt: null,
    });
  });

  it("denies cross-household reads by id", async () => {
    const { db, captured } = makeDb();
    await createGoalRepository(db).findById(HOUSEHOLD_A, "goal-1");
    expect(captured.goalWhere).toMatchObject({
      id: "goal-1",
      householdId: HOUSEHOLD_A,
    });
  });

  it("increments saved amount atomically and refuses a negative result (A-16)", async () => {
    const { db } = makeDb();
    const updateMany = db.savingsGoal.updateMany as ReturnType<typeof vi.fn>;
    await createGoalRepository(db).incrementSaved(HOUSEHOLD_A, "goal-1", -500);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "goal-1",
          householdId: HOUSEHOLD_A,
          deletedAt: null,
          savedAmountMinor: { gte: 500 },
        }),
        data: { savedAmountMinor: { increment: -500 } },
      }),
    );
  });

  it("soft-deletes idempotently within the household scope", async () => {
    const { db } = makeDb();
    const updateMany = db.savingsGoal.updateMany as ReturnType<typeof vi.fn>;
    const result = await createGoalRepository(db).softDelete(HOUSEHOLD_A, "goal-1", USER);
    expect(result.alreadyDeleted).toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "goal-1", householdId: HOUSEHOLD_A, deletedAt: null }),
      }),
    );
  });

  it("restores idempotently (second call reports alreadyActive)", async () => {
    const { db } = makeDb();
    const updateMany = db.savingsGoal.updateMany as ReturnType<typeof vi.fn>;
    updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await createGoalRepository(db).restore(HOUSEHOLD_A, "goal-1");
    expect(result.alreadyActive).toBe(true);
  });

  it("lists trash rows only, separate from active reads", () => {
    const { db, captured } = makeDb();
    createGoalRepository(db).listTrash(HOUSEHOLD_A);
    expect(captured.goalWhere).toMatchObject({
      householdId: HOUSEHOLD_A,
      deletedAt: { not: null },
    });
  });
});