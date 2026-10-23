/*
  Shared service-layer types (ADR-006). `ServiceResult` lets a service return a
  committed HTTP status + body (including a business 409 such as
  DUPLICATE_RECEIPT) that the idempotency layer stores and replays verbatim.
*/

import type {
  LedgerRepositories,
  PlanningRepositories,
} from "../repositories/ledger";

export type ServiceResult = { status: number; body: unknown };
/**
 * Runs `fn` with a consistent set of ledger repositories. Production wiring
 * wraps this in `prisma.$transaction`; unit tests pass a pass-through runner.
 */
export type LedgerTransaction = <T>(
  fn: (repos: LedgerRepositories) => Promise<T>,
) => Promise<T>;

/** Same contract for the goals/advisor services (T-007). */
export type PlanningTransaction = <T>(
  fn: (repos: PlanningRepositories) => Promise<T>,
) => Promise<T>;

export type { PlanningRepositories };
