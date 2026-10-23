import { describe, expect, it, vi } from "vitest";
import { createInviteRepository, createSessionRepository } from "./auth";
import { createIdempotencyRepository } from "./ledger";
import type { Db } from "./types";

const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";
const HOUSEHOLD_A = "11111111-1111-4111-8111-111111111111";

describe("IdempotencyRepository", () => {
  it("claims a key once per user (insert-as-claim)", async () => {
    const create = vi.fn(async () => ({}));
    const db = { $executeRawUnsafe: vi.fn(), idempotencyKey: { create, findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() } } as unknown as Db;
    const result = await createIdempotencyRepository(db).claim(USER, "key-1234-abcd", "hash", 24);
    expect(result.claimed).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER, key: "key-1234-abcd", requestHash: "hash" }),
    });
  });

  it("returns the existing row on conflict and compares the request hash", async () => {
    const existing = { requestHash: "hash-a", responseStatus: 200, responseBody: { ok: true } };
    const boom = Object.assign(new Error("unique constraint"), { code: "P2002" });
    const db = {
      $executeRawUnsafe: vi.fn(),
      idempotencyKey: {
        create: vi.fn(async () => {
          throw boom;
        }),
        findUnique: vi.fn(async () => existing),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
    } as unknown as Db;
    const result = await createIdempotencyRepository(db).claim(USER, "key-1234-abcd", "hash-a", 24);
    expect(result.claimed).toBe(false);
    expect(result.existing?.requestHash).toBe("hash-a");
  });

  it("rethrows non-unique errors instead of masking them as a conflict", async () => {
    const db = {
      $executeRawUnsafe: vi.fn(),
      idempotencyKey: {
        create: vi.fn(async () => {
          throw new Error("connection reset");
        }),
        findUnique: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
    } as unknown as Db;
    await expect(createIdempotencyRepository(db).claim(USER, "key-1234-abcd", "hash", 24)).rejects.toThrow(
      "connection reset",
    );
  });

  it("scopes the claim per user, not per household (A-22)", async () => {
    const create = vi.fn(async () => ({}));
    const db = { $executeRawUnsafe: vi.fn(), idempotencyKey: { create, findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() } } as unknown as Db;
    await createIdempotencyRepository(db).claim(OTHER_USER, "key-1234-abcd", "hash", 24);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: OTHER_USER }),
    });
  });

  it("purges only expired keys of the same user", async () => {
    const deleteMany = vi.fn(async () => ({ count: 0 }));
    const db = { idempotencyKey: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany } } as unknown as Db;
    await createIdempotencyRepository(db).purgeExpired(USER);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: USER, expiresAt: { lt: expect.any(Date) } },
    });
  });
});

describe("InviteRepository", () => {
  it("redeems conditionally: only when unredeemed, unrevoked, unexpired (anti-race)", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const db = { invite: { create: vi.fn(), findUnique: vi.fn(), updateMany } } as unknown as Db;
    const rowcount = await createInviteRepository(db).redeemConditional("invite-1", USER);
    expect(rowcount).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-1",
        redeemedAt: null,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { redeemedAt: expect.any(Date), redeemedByUserId: USER },
    });
  });

  it("revokes only within the household scope", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findUnique = vi.fn(async () => ({ id: "invite-1", revokedAt: new Date() }));
    const db = { invite: { create: vi.fn(), findUnique, updateMany } } as unknown as Db;
    await createInviteRepository(db).revoke(HOUSEHOLD_A, "invite-1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "invite-1", householdId: HOUSEHOLD_A, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("SessionRepository", () => {
  it("returns null for a revoked or expired session (revalidation)", async () => {
    const db = {
      session: {
        create: vi.fn(),
        findUnique: vi.fn(async () => ({
          id: "sid-1",
          userId: USER,
          tokenVersion: "v1",
          expiresAt: new Date(Date.now() - 1000),
          revokedAt: null,
        })),
        update: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    } as unknown as Db;
    const result = await createSessionRepository(db).findActiveById("sid-1");
    expect(result).toBeNull();
  });

  it("returns the session when active and unexpired", async () => {
    const db = {
      session: {
        create: vi.fn(),
        findUnique: vi.fn(async () => ({
          id: "sid-1",
          userId: USER,
          tokenVersion: "v1",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        })),
        update: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    } as unknown as Db;
    const result = await createSessionRepository(db).findActiveById("sid-1");
    expect(result?.userId).toBe(USER);
  });

  it("revokes only a not-yet-revoked session", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const db = {
      session: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany,
        deleteMany: vi.fn(),
      },
    } as unknown as Db;
    await createSessionRepository(db).revoke("sid-1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sid-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});