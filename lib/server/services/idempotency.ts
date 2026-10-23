/*
  IdempotencyService (AC-F3-8, A-11, A-22, ADR-008).

  Precedence is mandatory: claim the key FIRST, run dedup/mutation INSIDE the
  claim, write the response (status + body), then commit. If the mutation
  throws, the whole transaction rolls back and the key disappears, so a retry
  runs fresh. Scope is per USER (A-22). The request hash includes the method and
  path, so the same key on a different endpoint is a conflict.

  The stored response can be a business 409 (DUPLICATE_RECEIPT) as well as a
  success; both are replayed verbatim for a same-key + same-payload retry.

  The claim insert is savepoint-isolated in the repository (ledger.ts) so a
  duplicate-key hit does not abort the surrounding transaction, which would
  otherwise fail the replay read with 25P02.
*/

import { createHash } from "node:crypto";
import { conflict } from "../errors";
import type { IdempotencyRepository, LedgerRepositories } from "../repositories/ledger";
import type { ServiceResult } from "./types";

const TTL_HOURS = 24;

/**
 * Transaction runner over some repository bundle. `LedgerTransaction` and the
 * planning runner both satisfy this shape (T-007 reuse for goal/advisor POSTs).
 */
export type TransactionOf<R> = <T>(fn: (repos: R) => Promise<T>) => Promise<T>;

/** Deterministic JSON: object keys sorted, `undefined` dropped, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

/** sha256(method + path + canonical JSON) — key order does not matter. */
export function computeRequestHash(method: string, path: string, payload: unknown): string {
  return createHash("sha256")
    .update(`${method.toUpperCase()} ${path}\n${canonicalJson(payload)}`, "utf8")
    .digest("hex");
}

export class IdempotencyService<R extends { idempotency: IdempotencyRepository } = LedgerRepositories> {
  constructor(private readonly transaction: TransactionOf<R>) {}

  /** Runs `fn` under a claimed key, or replays the committed response. */
  async run(
    userId: string,
    key: string,
    requestHash: string,
    fn: (repos: R) => Promise<ServiceResult>,
  ): Promise<ServiceResult> {
    return this.transaction(async (repos) => {
      const claim = await repos.idempotency.claim(userId, key, requestHash, TTL_HOURS);
      if (!claim.claimed) {
        const existing = claim.existing;
        if (!existing) {
          throw conflict("IDEMPOTENCY_CONFLICT", "Permintaan ini tidak bisa diproses ulang.");
        }
        if (existing.requestHash !== requestHash) {
          throw conflict(
            "IDEMPOTENCY_CONFLICT",
            "Permintaan berbeda dengan yang sudah diproses sebelumnya.",
          );
        }
        if (existing.responseStatus === null) {
          throw conflict("IDEMPOTENCY_CONFLICT", "Permintaan ini sedang diproses. Coba lagi.");
        }
        return { status: existing.responseStatus, body: existing.responseBody };
      }

      const result = await fn(repos);
      await repos.idempotency.complete(userId, key, result.status, result.body);
      return result;
    });
  }
}
