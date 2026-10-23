import { afterEach, describe, expect, it, vi } from "vitest";

/*
  Regression test (bugfix 2026-10-23): `gemini-3.5-flash-lite` rejects
  `thinkingConfig.thinkingBudget: 0` with HTTP 400 INVALID_ARGUMENT, so every
  real Gemini call failed before the input was even evaluated (the classifier
  maps the 400 to OCR_MODEL_UNAVAILABLE / ADVISOR_UNAVAILABLE). Both providers
  therefore omit `thinkingConfig` entirely so the model keeps its default
  budget. The SDK is mocked so this stays deterministic and never performs a
  live network request.
*/

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(async (params: unknown) => {
    void params;
    return { text: '{"confidence":0.9,"missingFields":[]}' };
  }),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING", INTEGER: "INTEGER", NUMBER: "NUMBER", ARRAY: "ARRAY" },
}));

import { createGeminiAdvisorProvider } from "./advisor";
import { createGeminiOcrProvider } from "./ocr";

const AGGREGATE = {
  period: { start: "2026-10-01", end: "2026-10-31" },
  totalInMinor: 0,
  totalOutMinor: 0,
  budgetMinor: null,
  activeGoals: [],
};

type GenerateContentParams = { config?: { thinkingConfig?: { thinkingBudget?: number } } };

function capturedConfig(callIndex: number): GenerateContentParams["config"] {
  const params = generateContent.mock.calls[callIndex]?.[0] as GenerateContentParams | undefined;
  return params?.config;
}

describe("Gemini provider thinkingConfig (regression)", () => {
  const originalModel = process.env.GEMINI_MODEL;
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    generateContent.mockClear();
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("OCR calls generateContent without a zero thinking budget", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;

    const result = await createGeminiOcrProvider().extract(new Uint8Array([1, 2, 3]), "image/jpeg");

    expect(result.ok).toBe(true);
    const config = capturedConfig(0);
    expect(config?.thinkingConfig === undefined || config?.thinkingConfig?.thinkingBudget !== 0).toBe(true);
  });

  it("Advisor calls generateContent without a zero thinking budget", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;

    const result = await createGeminiAdvisorProvider().insight(AGGREGATE);

    expect(result.ok).toBe(true);
    const config = capturedConfig(0);
    expect(config?.thinkingConfig === undefined || config?.thinkingConfig?.thinkingBudget !== 0).toBe(true);
  });
});
