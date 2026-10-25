/*
  Pure HTTP plumbing shared by every route handler: JSON parsing, Zod
  validation, typed error mapping, and path params. No database import, so route
  tests can exercise real parsing/error behaviour without Prisma.
*/

import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { updateHouseholdSchema, type UpdateHouseholdInput } from "./contracts/family";
import { goldAssetInputSchema, type GoldAssetInput } from "./contracts/gold-assets";
import { changePasswordSchema, decisionSchema, loginSchema, signupSchema, updateProfileSchema, type ChangePasswordInput, type DecisionInput, type LoginInput, type SignupInput, type UpdateProfileInput } from "./contracts/auth";
import { formatFieldErrors } from "./contracts/common";
import { idempotencyKeyHeaderSchema } from "./contracts/common";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  trashListQuerySchema,
  type CreateTransactionInput,
  type ListTransactionsQuery,
  type TrashListQuery,
} from "./contracts/transactions";
import {
  budgetQuerySchema,
  budgetUpsertSchema,
  dashboardQuerySchema,
  type BudgetQuery,
  type BudgetUpsertInput,
  type DashboardQuery,
} from "./contracts/dashboard";
import {
  adjustSavedSchema,
  createGoalSchema,
  goalTrashListQuerySchema,
  type AdjustSavedInput,
  type CreateGoalInput,
} from "./contracts/goals";
import {
  advisorInsightRequestSchema,
  type AdvisorInsightRequest,
} from "./contracts/advisor";
import {
  createWalletSchema,
  listWalletsQuerySchema,
  updateWalletSchema,
  type CreateWalletInput,
  type ListWalletsQuery,
  type UpdateWalletInput,
} from "./contracts/wallets";
import {
  listInstitutionsQuerySchema,
  quickAddInstitutionSchema,
  type ListInstitutionsQuery,
  type QuickAddInstitutionInput,
} from "./contracts/institutions";
import {
  monthlyReportQuerySchema,
  type MonthlyReportQuery,
} from "./contracts/reports";
import { AppError, badRequest, unprocessable, unprocessableCode } from "./errors";

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("INVALID_JSON", "Format data tidak valid.");
  }
}

export function validationError(error: ZodError): AppError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.map(String).join(".") || "form";
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return unprocessable(fieldErrors);
}

export function respondError(error: unknown): NextResponse {
  const appError =
    error instanceof AppError
      ? error
      : new AppError({ code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server.", statusCode: 500 });
  return NextResponse.json(
    {
      error: {
        ...(appError.meta ?? {}),
        code: appError.code,
        message: appError.message,
        fieldErrors: appError.fieldErrors,
      },
    },
    { status: appError.statusCode },
  );
}

export function parseSignup(input: unknown): SignupInput {
  const result = signupSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseLogin(input: unknown): LoginInput {
  const result = loginSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseUpdateProfile(input: unknown): UpdateProfileInput {
  const result = updateProfileSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseChangePassword(input: unknown): ChangePasswordInput {
  const result = changePasswordSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseDecision(input: unknown): DecisionInput {
  const result = decisionSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseUpdateHousehold(input: unknown): UpdateHouseholdInput {
  const result = updateHouseholdSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseGoldAssetInput(input: unknown): GoldAssetInput {
  const result = goldAssetInputSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function pathParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest("INVALID_PATH", "Permintaan tidak valid.");
  }
  return value;
}

/** `Idempotency-Key` header (A-22); absent means a normal non-idempotent run. */
export function parseIdempotencyKey(request: Request): string | undefined {
  const raw = request.headers.get("idempotency-key");
  if (raw === null) return undefined;
  const result = idempotencyKeyHeaderSchema.safeParse(raw);
  if (!result.success) {
    throw badRequest(
      "INVALID_IDEMPOTENCY_KEY",
      result.error.issues[0]?.message ?? "Kunci idempotensi tidak valid.",
    );
  }
  return result.data;
}

/**
 * `Idempotency-Key` header required by T-012 retry. Missing and malformed keys
 * share the same 400 code; the client regenerates one key per user tap.
 */
export function parseRequiredIdempotencyKey(request: Request): string {
  const raw = request.headers.get("idempotency-key");
  if (raw === null || raw.length === 0) {
    throw badRequest("INVALID_IDEMPOTENCY_KEY", "Kunci idempotensi wajib diisi.");
  }
  const result = idempotencyKeyHeaderSchema.safeParse(raw);
  if (!result.success) {
    throw badRequest(
      "INVALID_IDEMPOTENCY_KEY",
      result.error.issues[0]?.message ?? "Kunci idempotensi tidak valid.",
    );
  }
  return result.data;
}

/**
 * Parses the transaction body. An amount above int32 max maps to the explicit
 * `AMOUNT_OUT_OF_RANGE` code (AC-F3-1); everything else is a field validation.
 */
export function parseCreateTransaction(input: unknown): CreateTransactionInput {
  const result = createTransactionSchema.safeParse(input);
  if (!result.success) {
    const tooBig = result.error.issues.some(
      (issue) => issue.path[0] === "amountMinor" && issue.code === "too_big",
    );
    throw unprocessableCode(
      tooBig ? "AMOUNT_OUT_OF_RANGE" : "VALIDATION_ERROR",
      formatFieldErrors(result.error),
    );
  }
  return result.data;
}

export function parseListTransactionsQuery(searchParams: URLSearchParams): ListTransactionsQuery {
  const result = listTransactionsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseTrashListQuery(searchParams: URLSearchParams): TrashListQuery {
  const result = trashListQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseDashboardQuery(searchParams: URLSearchParams): DashboardQuery {
  const result = dashboardQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/** GET /api/budget query; absent scope defaults to `shared` (AC-F2-2c). */
export function parseBudgetQuery(searchParams: URLSearchParams): BudgetQuery {
  const result = budgetQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/** GET /api/reports/monthly query (feat-reporting). */
export function parseReportQuery(searchParams: URLSearchParams): MonthlyReportQuery {
  const result = monthlyReportQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseBudgetUpsert(input: unknown): BudgetUpsertInput {
  const result = budgetUpsertSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/* ── Goals (T-007) ─────────────────────────────────────────────────── */

export function parseCreateGoal(input: unknown): CreateGoalInput {
  const result = createGoalSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseAdjustSaved(input: unknown): AdjustSavedInput {
  const result = adjustSavedSchema.safeParse(input);
  if (!result.success) {
    /* Shape errors are field errors; the delta boundary rules surface as 422. */
    throw unprocessableCode("SAVED_AMOUNT_INVALID", formatFieldErrors(result.error), "Jumlah perubahan tidak valid.");
  }
  return result.data;
}

export function parseGoalTrashListQuery(searchParams: URLSearchParams) {
  const result = goalTrashListQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/** The advisor body: period <= 90 days, start <= end (AC-F4-5). */
export function parseAdvisorInsightRequest(input: unknown): AdvisorInsightRequest {
  const result = advisorInsightRequestSchema.safeParse(input);
  if (!result.success) {
    throw unprocessableCode("VALIDATION_ERROR", formatFieldErrors(result.error), "Rentang tanggal tidak valid.");
  }
  return result.data;
}

/* ── Wallets (T-009 / F6) ──────────────────────────────────────────── */

export function parseCreateWallet(input: unknown): CreateWalletInput {
  const result = createWalletSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/**
 * Update body has no `scope` field (C-31): a stray `scope` key is an
 * unrecognized key mapped to 422 `VALIDATION_ERROR` with `fieldErrors.scope`.
 */
export function parseUpdateWallet(input: unknown): UpdateWalletInput {
  const result = updateWalletSchema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) {
          const message = key === "scope" ? "Jenis dompet tidak bisa diubah." : "Field tidak dikenal.";
          fieldErrors[key] = [...(fieldErrors[key] ?? []), message];
        }
        continue;
      }
      const field = issue.path.map(String).join(".") || "form";
      fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
    throw unprocessable(fieldErrors);
  }
  return result.data;
}

export function parseListWalletsQuery(searchParams: URLSearchParams): ListWalletsQuery {
  const result = listWalletsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/* ── Institutions (T-011 / F6 extension) ───────────────────────────── */

export function parseQuickAddInstitution(input: unknown): QuickAddInstitutionInput {
  const result = quickAddInstitutionSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseListInstitutionsQuery(searchParams: URLSearchParams): ListInstitutionsQuery {
  const result = listInstitutionsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) throw validationError(result.error);
  return result.data;
}
