import { describe, expect, it, vi } from "vitest";
import {
  canonicalJson,
  computeRequestHash,
  IdempotencyService,
} from "./idempotency";
import { createFakeLedger, createFakeStore } from "../testing/fakes";
import type { LedgerTransaction } from "./types";

function setup() {
  const store = createFakeStore();
  const { transaction } = createFakeLedger(store);
  return { service: new IdempotencyService(transaction), store };
}

/** Transaction runner that restores the idempotency map when `fn` throws. */
function setupWithRollback() {
  const store = createFakeStore();
  const { repos } = createFakeLedger(store);
  const transaction: LedgerTransaction = async (fn) => {
    const before = new Map(store.idempotency);
    try {
      return await fn(repos);
    } catch (error) {
      store.idempotency.clear();
      for (const [key, value] of before) store.idempotency.set(key, value);
      throw error;
    }
  };
  return { service: new IdempotencyService(transaction), store };
}

describe("canonicalJson / computeRequestHash", () => {
  it("is insensitive to object key order (AC-F3-8)", () => {
    expect(canonicalJson({ b: 1, a: { d: 3, c: 4 } })).toBe(canonicalJson({ a: { c: 4, d: 3 }, b: 1 }));
    expect(computeRequestHash("post", "/api/transactions", { b: 1, a: 2 })).toBe(
      computeRequestHash("POST", "/api/transactions", { a: 2, b: 1 }),
    );
  });

  it("includes the path so the same key on another endpoint differs (AC-F3-8)", () => {
    expect(computeRequestHash("POST", "/api/transactions", { a: 1 })).not.toBe(
      computeRequestHash("POST", "/api/ocr/receipts", { a: 1 }),
    );
  });

  it("includes the HTTP method so the same key + payload on another method differs (AC-F3-8)", () => {
    expect(computeRequestHash("POST", "/api/transactions", { a: 1 })).not.toBe(
      computeRequestHash("PUT", "/api/transactions", { a: 1 }),
    );
  });
});

describe("IdempotencyService", () => {
  it("claims the key, runs the mutation, then completes with status + body", async () => {
    const { service } = setup();
    const fn = vi.fn(async () => ({ status: 201, body: { ok: true } }));
    const result = await service.run("u1", "key-aaaaaaaa", "hash-1", fn);
    expect(result).toEqual({ status: 201, body: { ok: true } });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("replays the stored response for the same key + hash without re-running the mutation", async () => {
    const { service } = setup();
    const fn = vi.fn(async () => ({ status: 201, body: { first: true } }));
    await service.run("u1", "key-aaaaaaaa", "hash-1", fn);
    const replayFn = vi.fn(async () => ({ status: 201, body: { second: true } }));
    const replay = await service.run("u1", "key-aaaaaaaa", "hash-1", replayFn);
    expect(replay).toEqual({ status: 201, body: { first: true } });
    expect(replayFn).not.toHaveBeenCalled();
  });

  it("returns 409 IDEMPOTENCY_CONFLICT for the same key + different hash", async () => {
    const { service } = setup();
    await service.run("u1", "key-aaaaaaaa", "hash-1", async () => ({ status: 200, body: {} }));
    await expect(
      service.run("u1", "key-aaaaaaaa", "hash-2", async () => ({ status: 200, body: {} })),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", statusCode: 409 });
  });

  it("is scoped per user: the same key for another user is a fresh claim (A-22)", async () => {
    const { service } = setup();
    await service.run("u1", "key-aaaaaaaa", "hash-1", async () => ({ status: 201, body: { owner: "u1" } }));
    const other = await service.run("u2", "key-aaaaaaaa", "hash-1", async () => ({ status: 201, body: { owner: "u2" } }));
    expect(other).toEqual({ status: 201, body: { owner: "u2" } });
  });

  it("rolls back the key when the mutation fails so a retry runs fresh (AC-F3-8)", async () => {
    const { service, store } = setupWithRollback();
    const key = "key-dddddddd";
    const failing = vi.fn(async () => {
      throw new Error("mutation failed");
    });
    await expect(service.run("u1", key, "hash-1", failing)).rejects.toThrow("mutation failed");
    expect(store.idempotency.size).toBe(0);

    const retry = vi.fn(async () => ({ status: 201, body: { ok: true } }));
    await expect(service.run("u1", key, "hash-1", retry)).resolves.toEqual({ status: 201, body: { ok: true } });
    expect(retry).toHaveBeenCalledOnce();
  });
});