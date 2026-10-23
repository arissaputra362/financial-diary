/*
  Bounded Gemini model chain (ADR-003, amended 2026-10-23). Both Gemini providers
  resolve an ordered, deduped model chain from env and may move to the next model
  ONLY on model-specific failures (HTTP 429 RESOURCE_EXHAUSTED, 404 retired model,
  503 UNAVAILABLE). Gemini free-tier quota applies per project AND per model, so a
  different configured model is a separate quota bucket.

  Pure functions, no SDK import and no env access here: the caller resolves env
  values and passes them in, so the policy is trivially testable.
*/

/** Default primary model when `GEMINI_MODEL` is unset or blank. */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/** Default fallbacks when `GEMINI_MODEL_FALLBACKS` is unset or blank. */
export const DEFAULT_FALLBACK_MODELS = ["gemini-3.1-flash-lite"];

/** Hard cap for the whole chain: a single request never tries more than 3 models. */
export const MAX_MODEL_CHAIN = 3;

/**
 * Resolve the model chain: primary first, then fallbacks. Tokens are trimmed,
 * empties dropped, duplicates removed, and the whole chain is capped at
 * `MAX_MODEL_CHAIN`. Never returns an empty array.
 */
export function resolveModelChain(
  primaryRaw: string | undefined,
  fallbacksRaw: string | undefined,
): string[] {
  const chain: string[] = [];
  const tryPush = (value: string | undefined): void => {
    if (chain.length >= MAX_MODEL_CHAIN) return;
    const name = value?.trim();
    if (!name || chain.includes(name)) return;
    chain.push(name);
  };

  if (primaryRaw?.trim()) tryPush(primaryRaw);
  else tryPush(DEFAULT_MODEL);

  /* Blank env means "use the documented defaults", never "no fallbacks". */
  const fallbacks = fallbacksRaw?.trim()
    ? fallbacksRaw
    : DEFAULT_FALLBACK_MODELS.join(",");
  for (const token of fallbacks.split(",")) tryPush(token);

  return chain;
}

/** HTTP status attached by the Gemini SDK error, when present. */
export function providerStatus(error: unknown): number | null {
  if (typeof error === "object" && error !== null) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

/**
 * Fallback triggers on model-specific failures only: quota/rate limit (429),
 * retired/unknown model (404), unavailable (503). Everything else — including
 * HTTP 400 INVALID_ARGUMENT (a request bug must surface) and timeout/abort
 * errors (no `status`) — must NOT mask across models.
 */
export function isModelFallbackWorthy(error: unknown): boolean {
  const status = providerStatus(error);
  return status === 429 || status === 404 || status === 503;
}
