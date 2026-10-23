import { afterEach, describe, expect, it, vi } from "vitest";

/*
  Bounded model fallback behavior (ADR-003 amended 2026-10-23, AC-4c / AC-7b).
  The SDK is mocked in the style of `model-selection.test.ts`, so this stays
  deterministic and never performs a live request.

  Policy: fallback to the next configured model ONLY on HTTP 429/404/503;
  never on 400 invalid argument or on timeout. Final code precedence: any 429
  attempt ends the request with the rate-limited code; otherwise the last
  attempt's classified code wins. Missing `GEMINI_API_KEY` stays fail-closed
  with zero provider calls.
*/

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING", INTEGER: "INTEGER", NUMBER: "NUMBER", ARRAY: "ARRAY" },
}));

import { createGeminiAdvisorProvider } from "./advisor";
import { createGeminiOcrProvider } from "./ocr";

const VALID_JSON = '{"confidence":0.9,"missingFields":[]}';

const AGGREGATE = {
  period: { start: "2026-10-01", end: "2026-10-31" },
  totalInMinor: 0,
  totalOutMinor: 0,
  budgetMinor: null,
  activeGoals: [],
};

const ENV_KEYS = ["GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_MODEL_FALLBACKS"] as const;
const ORIGINAL_ENV: Record<string, string | undefined> = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

type Outcome = "ok" | "429" | "400" | "404" | "503" | "abort";

/** Queue per-call outcomes; "429" etc. are thrown as SDK-style `status` errors. */
function queue(...outcomes: Outcome[]): void {
  let step = 0;
  generateContent.mockImplementation(async () => {
    const outcome: Outcome = outcomes[step] ?? "ok";
    step += 1;
    if (outcome === "ok") return { text: VALID_JSON };
    if (outcome === "abort") {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    }
    throw Object.assign(new Error(`HTTP ${outcome}`), { status: Number(outcome) });
  });
}

function alwaysThrow(outcome: Outcome): void {
  queue(...Array<Outcome>(5).fill(outcome));
}

function configuredModels(): string[] {
  return generateContent.mock.calls.map((call) => (call[0] as { model: string }).model);
}

describe("Gemini bounded model fallback", () => {
  afterEach(() => {
    generateContent.mockReset();
    for (const key of ENV_KEYS) {
      if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
      else process.env[key] = ORIGINAL_ENV[key];
    }
  });

  describe("OCR provider", () => {
    const extract = () => createGeminiOcrProvider().extract(new Uint8Array([1, 2, 3]), "image/jpeg");

    it("a) falls back once on 429 and reports the model that succeeded", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      queue("429", "ok");

      const result = await extract();

      expect(result).toEqual({
        ok: true,
        model: "gemini-fallback",
        raw: JSON.parse(VALID_JSON),
      });
      expect(generateContent).toHaveBeenCalledTimes(2);
      expect(configuredModels()).toEqual(["gemini-primary", "gemini-fallback"]);
    });

    it("b) ends with OCR_RATE_LIMITED when every attempt is rate-limited", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      queue("429", "429");

      const result = await extract();

      expect(result).toEqual({ ok: false, errorCode: "OCR_RATE_LIMITED" });
      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it("c) never falls back on HTTP 400 INVALID_ARGUMENT", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      queue("400");

      const result = await extract();

      expect(result).toEqual({
        ok: false,
        errorCode: "OCR_MODEL_UNAVAILABLE",
      });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it("d) never falls back on timeout-shaped errors", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      queue("abort");

      const result = await extract();

      expect(result).toEqual({ ok: false, errorCode: "OCR_TIMEOUT" });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it("e) stays fail-closed without GEMINI_API_KEY (zero provider calls)", async () => {
      delete process.env.GEMINI_API_KEY;
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      alwaysThrow("ok");

      const result = await extract();

      expect(result).toEqual({ ok: false, errorCode: "OCR_MODEL_UNAVAILABLE" });
      expect(generateContent).not.toHaveBeenCalled();
    });
  });

  describe("Advisor provider", () => {
    const insight = () => createGeminiAdvisorProvider().insight(AGGREGATE);

    it("a) falls back once on 429 and reports the model that succeeded", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      queue("429", "ok");

      const result = await insight();

      expect(result).toEqual({
        ok: true,
        model: "gemini-fallback",
        raw: JSON.parse(VALID_JSON),
      });
      expect(generateContent).toHaveBeenCalledTimes(2);
      expect(configuredModels()).toEqual(["gemini-primary", "gemini-fallback"]);
    });

    it("b) ends with ADVISOR_RATE_LIMITED when every attempt is rate-limited", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      queue("429", "429");

      const result = await insight();

      expect(result).toEqual({ ok: false, errorCode: "ADVISOR_RATE_LIMITED" });
      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it("c) never falls back on HTTP 400 INVALID_ARGUMENT", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      queue("400");

      const result = await insight();

      expect(result).toEqual({
        ok: false,
        errorCode: "ADVISOR_UNAVAILABLE",
      });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it("d) never falls back on timeout-shaped errors", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      queue("abort");

      const result = await insight();

      expect(result).toEqual({ ok: false, errorCode: "ADVISOR_UNAVAILABLE" });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it("e) stays fail-closed without GEMINI_API_KEY (zero provider calls)", async () => {
      delete process.env.GEMINI_API_KEY;
      process.env.GEMINI_MODEL = "gemini-primary";
      process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
      alwaysThrow("ok");

      const result = await insight();

      expect(result).toEqual({ ok: false, errorCode: "ADVISOR_UNAVAILABLE" });
      expect(generateContent).not.toHaveBeenCalled();
    });
  });

  it("retries the same model never and caps at the chain length (3 models, all 429)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-primary";
    process.env.GEMINI_MODEL_FALLBACKS = "gemini-f1,gemini-f2,gemini-f3";
    alwaysThrow("429");

    const result = await createGeminiOcrProvider().extract(new Uint8Array([1]), "image/jpeg");

    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(configuredModels()).toEqual([
      "gemini-primary",
      "gemini-f1",
      "gemini-f2",
    ]);
    expect(result).toEqual({ ok: false, errorCode: "OCR_RATE_LIMITED" });
  });

  it("treats 404 and 503 as fallback-worthy: last unavailable code wins", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-primary";
    process.env.GEMINI_MODEL_FALLBACKS = "gemini-fallback";
    queue("404", "503");

    const result = await createGeminiOcrProvider().extract(new Uint8Array([1]), "image/jpeg");

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: false, errorCode: "OCR_MODEL_UNAVAILABLE" });
  });
});
