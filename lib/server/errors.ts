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

  constructor(opts: {
    code: string;
    message: string;
    statusCode: number;
    fieldErrors?: Record<string, string[]> | null;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.fieldErrors = opts.fieldErrors ?? null;
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

export function unprocessable(fieldErrors: Record<string, string[]>): AppError {
  return new AppError({ code: "VALIDATION_ERROR", message: "Periksa input Anda.", statusCode: 422, fieldErrors });
}

export function notFound(message = "Sumber daya tidak ditemukan."): AppError {
  return new AppError({ code: "NOT_FOUND", message, statusCode: 404 });
}

export function unauthorized(message = "Silakan masuk kembali."): AppError {
  return new AppError({ code: "UNAUTHORIZED", message, statusCode: 401 });
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