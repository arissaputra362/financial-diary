import { afterEach, describe, expect, it, vi } from "vitest";

/*
  Provider model selection (WO-008): both the OCR and Advisor Gemini providers
  must resolve `GEMINI_MODEL`, falling back to `gemini-3.5-flash-lite`. The SDK
  is mocked so this stays deterministic and never performs a live request.
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

describe("Gemini provider model selection (WO-008)", () => {
  const originalModel = process.env.GEMINI_MODEL;
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    generateContent.mockClear();
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("OCR defaults to gemini-3.5-flash-lite when GEMINI_MODEL is unset", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;

    await createGeminiOcrProvider().extract(new Uint8Array([1, 2, 3]), "image/jpeg");

    expect(generateContent.mock.calls[0]?.[0]).toMatchObject({ model: "gemini-3.5-flash-lite" });
  });

  it("Advisor defaults to gemini-3.5-flash-lite when GEMINI_MODEL is unset", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;

    await createGeminiAdvisorProvider().insight(AGGREGATE);

    expect(generateContent.mock.calls[0]?.[0]).toMatchObject({ model: "gemini-3.5-flash-lite" });
  });

  it("both providers honor the GEMINI_MODEL override", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-custom";

    await createGeminiOcrProvider().extract(new Uint8Array([1, 2, 3]), "image/jpeg");
    await createGeminiAdvisorProvider().insight(AGGREGATE);

    expect(generateContent.mock.calls[0]?.[0]).toMatchObject({ model: "gemini-custom" });
    expect(generateContent.mock.calls[1]?.[0]).toMatchObject({ model: "gemini-custom" });
  });
});
