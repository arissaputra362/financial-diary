/*
  Client-side API helper. Browser code never reads server env: every call goes
  through an App Router route handler (AC-F3-9). Errors come back in the shared
  envelope `{ error: { code, message, fieldErrors } }`; a duplicate receipt
  carries extra `job`/`draft` fields.
*/

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[]> | null;
    /** T-011 duplicate Quick Add match (own custom row or public official row). */
    existing?: {
      kind: "OFFICIAL" | "CUSTOM";
      id: string;
      name: string;
    };
  };
};

export type ApiResponse<T> = {
  status: number;
  ok: boolean;
  data: (T & ApiErrorBody) | null;
};

const API_REQUEST_TIMEOUT_MS = 15_000;

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort();

  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...init,
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, ok: response.ok, data: (data as T & ApiErrorBody) ?? null };
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export function idempotencyHeaders(): Record<string, string> {
  return { "Idempotency-Key": randomKey() };
}

/** UUID per submit attempt (AC-F3-8); the route only requires an 8+ char key. */
function randomKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}