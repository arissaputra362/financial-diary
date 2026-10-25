/*
  Typed errors + HTTP mapping (ADR-006, feat-auth-approval).
  Every error carries a machine-readable `code` and optional `fieldErrors`.
  Route handlers map these to the correct HTTP status + JSON body:
  { error: { code, message, fieldErrors } }.
*/

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly fieldErrors: Record<string, string[]> | null;
  /** Additive machine-readable context (e.g. the duplicate institution match). */
  readonly meta: Record<string, unknown> | null;

  constructor(opts: {
    code: string;
    message: string;
    statusCode: number;
    fieldErrors?: Record<string, string[]> | null;
    meta?: Record<string, unknown> | null;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.fieldErrors = opts.fieldErrors ?? null;
    this.meta = opts.meta ?? null;
  }
}

/* ── helpers ─────────────────────────────────────────────────────── */

export function forbidden(code: string, message: string): AppError {
  return new AppError({ code, message, statusCode: 403 });
}

export function badRequest(code: string, message: string, fieldErrors?: Record<string, string[]>): AppError {
  return new AppError({ code, message, statusCode: 400, fieldErrors: fieldErrors ?? null });
}

export function conflict(code: string, message: string): AppError {
  return new AppError({ code, message, statusCode: 409 });
}

/** 409 with additive context (e.g. the matching official/own custom row). */
export function conflictWithMeta(
  code: string,
  message: string,
  meta: Record<string, unknown>,
): AppError {
  return new AppError({ code, message, statusCode: 409, meta });
}

export function unprocessable(fieldErrors: Record<string, string[]>): AppError {
  return new AppError({ code: "VALIDATION_ERROR", message: "Periksa input Anda.", statusCode: 422, fieldErrors });
}

/** 422 with an explicit machine code (A-08 amount/date, A-21 file boundary). */
export function unprocessableCode(
  code: string,
  fieldErrors: Record<string, string[]>,
  message = "Periksa input Anda.",
): AppError {
  return new AppError({ code, message, statusCode: 422, fieldErrors });
}

export function fileInvalid(message: string): AppError {
  return unprocessableCode("FILE_INVALID", { file: [message] }, "File tidak bisa diproses.");
}

export function notFound(message = "Sumber daya tidak ditemukan."): AppError {
  return new AppError({ code: "NOT_FOUND", message, statusCode: 404 });
}

export function unauthorized(message = "Silakan masuk kembali."): AppError {
  return new AppError({ code: "UNAUTHORIZED", message, statusCode: 401 });
}

/* ── Wallet error namespace (A-49, amended by A-51, T-009) ─────────── */

/*
  Transfer wallet-pair failures map to the ratified A-51 contract, reusing
  existing codes only: missing/malformed ids or a same-source/destination pair
  -> 422 `VALIDATION_ERROR` with field errors (see `unprocessable`), an archived
  wallet -> 422 `WALLET_UNAVAILABLE`, an unknown/foreign/invisible wallet ->
  generic 404 `NOT_FOUND`. There is deliberately no `TRANSFER_INVALID` code.
*/

/** Selected wallet archived/unavailable at submit (design 06 §7, A-43). */
export function walletUnavailable(
  message = "Dompet ini sudah diarsipkan. Pilih dompet lain.",
): AppError {
  return unprocessableCode("WALLET_UNAVAILABLE", { walletId: [message] });
}

/** Opening balance edit after the first transaction row exists (A-42). */
export function openingBalanceLocked(): AppError {
  return unprocessableCode(
    "WALLET_OPENING_BALANCE_LOCKED",
    { openingBalanceMinor: ["Saldo awal terkunci: sudah ada transaksi untuk dompet ini."] },
    "Saldo awal tidak bisa diedit lagi.",
  );
}

/* ── Institution errors (T-011 / A-57) ─────────────────────────────── */

/** Official row inactive or the actor's custom row archived. */
export function institutionUnavailable(
  message = "Bank atau penyedia ini tidak tersedia. Pilih yang lain.",
): AppError {
  return unprocessableCode("INSTITUTION_UNAVAILABLE", { institution: [message] });
}

/**
 * Normalized-name duplicate. `existing` only ever carries the actor's own
 * private row or a public official row; another user's private entry is never
 * disclosed (A-56/A-57).
 */
export function institutionAlreadyExists(existing: {
  kind: "OFFICIAL" | "CUSTOM";
  id: string;
  name: string;
}): AppError {
  return conflictWithMeta(
    "INSTITUTION_ALREADY_EXISTS",
    existing.kind === "OFFICIAL"
      ? "Nama ini sudah ada di bank resmi. Pilih dari daftar resmi."
      : "Nama ini sudah ada di daftar pribadimu. Pilih entri yang sudah ada.",
    { existing },
  );
}

/*
  Non-approved members are allowed to call only `/api/auth/me` and
  `/api/auth/logout`. Every other protected route maps the membership status to
  a typed 403 (feat-auth-approval AC-F1-4). Returns null when the request is
  allowed through.
*/
export function accessDeniedForStatus(status: string): AppError | null {
  const message = "Akun Anda belum memiliki akses ke data keluarga.";
  if (status === "PENDING") return forbidden("ACCESS_PENDING", message);
  if (status === "DECLINED") return forbidden("ACCESS_DECLINED", message);
  if (status === "REVOKED") return forbidden("ACCESS_REVOKED", message);
  return null;
}

/* ── Report scope (feat-reporting AC-F7-7) ─────────────────────────── */

/** Personal report requested by a member who has no personal wallet. */
export function reportScopeUnavailable(
  message = "Kamu belum punya dompet pribadi.",
): AppError {
  return unprocessableCode("REPORT_SCOPE_UNAVAILABLE", { scope: [message] }, message);
}

/* ── OCR retry control errors (T-012 / AC-F3-10..13) ───────────────── */

/*
  These 409 codes are control-flow responses, not model failures. They never
  become `OcrJob.errorCode`; the OCR namespace above stays model-only.
*/

/** Target is no longer the latest FAILED job (stale, PROCESSING, or SUCCEEDED). */
export function ocrNotRetryable(
  message = "Struk ini tidak bisa dipindai ulang. Coba unggah ulang struknya.",
): AppError {
  return conflict("OCR_NOT_RETRYABLE", message);
}

/** A retry for this receipt already owns the processing claim. */
export function ocrRetryInProgress(
  message = "Struk ini sedang dipindai. Tunggu sampai pemindaian selesai.",
): AppError {
  return conflict("OCR_RETRY_IN_PROGRESS", message);
}

/** Stored private bytes are missing, unreadable, empty, or size-mismatched. */
export function ocrImageUnavailable(
  message = "Gambar struk tidak tersedia lagi. Isi transaksi secara manual atau pilih struk lain.",
): AppError {
  return conflict("OCR_IMAGE_UNAVAILABLE", message);
}