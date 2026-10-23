import { z } from "zod";

/*
  Shared contract primitives (A-14 cursor/limit, A-22 idempotency, error envelope).
  All error messages are plain-language Indonesian (A-30) — they surface directly
  in fieldErrors, never as a generic 500.
*/

/** Opaque base64 keyset cursor `(occurred_at DESC, id DESC)` (A-14). */
export const cursorSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/=_-]+$/, "Penanda halaman tidak valid.");

/** limit default 20, max 50; above 50 → 422 (A-14). */
export const limitSchema = z.coerce
  .number()
  .int("Jumlah per halaman tidak valid.")
  .min(1, "Jumlah per halaman minimal 1.")
  .max(50, "Jumlah per halaman maksimal 50.")
  .default(20);

/** `Idempotency-Key` header (A-22): scope per user, opaque string. */
export const idempotencyKeyHeaderSchema = z
  .string()
  .min(8, "Kunci idempotensi tidak valid.")
  .max(255, "Kunci idempotensi terlalu panjang.");

/** Canonical API error envelope (arch-dec "API contract"). */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    /** T-011 duplicate Quick Add match (own custom row or public official row). */
    existing: z
      .object({
        kind: z.enum(["OFFICIAL", "CUSTOM"]),
        id: z.string(),
        name: z.string(),
      })
      .optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Machine-readable error codes owned by T-003 contracts. */
export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  ALREADY_ACTIVE: "ALREADY_ACTIVE",
  ALREADY_DELETED: "ALREADY_DELETED",
  FILE_INVALID: "FILE_INVALID",
  DUPLICATE_RECEIPT: "DUPLICATE_RECEIPT",
  SAVED_AMOUNT_INVALID: "SAVED_AMOUNT_INVALID",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  ACCESS_PENDING: "ACCESS_PENDING",
  ACCESS_DECLINED: "ACCESS_DECLINED",
  ACCESS_REVOKED: "ACCESS_REVOKED",
  INVALID_INVITE: "INVALID_INVITE",
} as const;

/** OCR error namespace (A-10): HTTP stays 200, failure lives in the envelope. */
export const OCR_ERROR_CODES = [
  "OCR_TIMEOUT",
  "OCR_RATE_LIMITED",
  "OCR_INVALID_OUTPUT",
  "OCR_MODEL_UNAVAILABLE",
] as const;

export type OcrErrorCode = (typeof OCR_ERROR_CODES)[number];

/** Advisor error codes (ADR-003): typed 429/503/422. */
export const ADVISOR_ERROR_CODES = [
  "ADVISOR_RATE_LIMITED",
  "ADVISOR_UNAVAILABLE",
  "ADVISOR_INVALID_OUTPUT",
] as const;

export type AdvisorErrorCode = (typeof ADVISOR_ERROR_CODES)[number];

/**
 * Build the explicit structured error for an invalid payload (AC: "Invalid
 * payloads return explicit errors"). Route handlers map this to HTTP 422.
 */
export function formatFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export function validationErrorEnvelope(error: z.ZodError): ErrorEnvelope {
  return {
    error: {
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "Data yang dikirim tidak valid.",
      fieldErrors: formatFieldErrors(error),
    },
  };
}