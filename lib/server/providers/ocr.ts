/*
  OcrProvider seam (ADR-003, feat-transactions-ocr). The real implementation
  calls Gemini Vision with structured output; tests inject a fake provider and
  the route never wires a fake (mock-seams dev plan).

  Fail-closed: every failure becomes a typed `OcrErrorCode`, never fabricated
  data. Model output is untrusted and is re-validated with Zod in the service.
  Bounded model fallback: only model-specific failures (HTTP 429/404/503) may
  move to the next configured model, at most once each, max 3 models (AC-4c).
*/

import { GoogleGenAI, Type } from "@google/genai";
import { CATEGORIES } from "../contracts/transactions";
import type { OcrErrorCode } from "../contracts/common";
import { isModelFallbackWorthy, providerStatus, resolveModelChain } from "./model-chain";

export type OcrExtraction =
  | { ok: true; model: string; raw: unknown }
  | { ok: false; errorCode: OcrErrorCode };

export interface OcrProvider {
  extract(imageBytes: Uint8Array, mimeType: string): Promise<OcrExtraction>;
}

/** Explicit per-attempt timeout (ADR-003: 8-10 seconds). */
export const OCR_TIMEOUT_MS = 9_000;

/** Time budget for the whole bounded chain (route `maxDuration = 30`). */
const OCR_CHAIN_BUDGET_MS = 28_000;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    merchant: { type: Type.STRING, nullable: true },
    totalAmountMinor: { type: Type.INTEGER, nullable: true },
    currencyCode: { type: Type.STRING, nullable: true },
    occurredAt: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING, nullable: true },
    taxAmountMinor: { type: Type.INTEGER, nullable: true },
    confidence: { type: Type.NUMBER },
    missingFields: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    notes: { type: Type.STRING, nullable: true },
  },
  required: ["confidence", "missingFields"],
};

const PROMPT = [
  "Baca foto struk atau bukti transfer ini dan isi data transaksi.",
  "Aturan penting:",
  "- Semua jumlah dalam Rupiah utuh (IDR tanpa desimal). Contoh: Rp64.800 diisi 64800, bukan 6480000.",
  "- occurredAt hanya tanggal format YYYY-MM-DD.",
  `- category harus salah satu dari: ${CATEGORIES.join(", ")}, atau null bila tidak yakin.`,
  "- confidence angka 0 sampai 1 sesuai keyakinanmu.",
  "- Isi missingFields dengan nama field yang tidak terbaca (merchant, totalAmountMinor, occurredAt, category).",
  "- Jangan mengarang data. Field yang tidak terbaca biarkan null dan masukkan ke missingFields.",
  "- notes singkat bila ada catatan penting.",
].join("\n");

class OcrProviderTimeoutError extends Error {
  constructor() {
    super("OCR provider timed out.");
    this.name = "OcrProviderTimeoutError";
  }
}

function classify(error: unknown): OcrErrorCode {
  if (error instanceof OcrProviderTimeoutError) return "OCR_TIMEOUT";
  const record = error as { name?: string; status?: number; message?: string } | null;
  if (record?.name === "AbortError") return "OCR_TIMEOUT";
  if (typeof record?.message === "string" && /timeout|timed out|aborted/i.test(record.message)) {
    return "OCR_TIMEOUT";
  }
  const status = record?.status;
  if (status === 429) return "OCR_RATE_LIMITED";
  return "OCR_MODEL_UNAVAILABLE";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OcrProviderTimeoutError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createGeminiOcrProvider(): OcrProvider {
  return {
    async extract(imageBytes, mimeType): Promise<OcrExtraction> {
      /* Fail-closed: missing credential is a model-unavailable condition.
         Never configured, never a single HTTP call. */
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return { ok: false, errorCode: "OCR_MODEL_UNAVAILABLE" };

      const chain = resolveModelChain(
        process.env.GEMINI_MODEL,
        process.env.GEMINI_MODEL_FALLBACKS,
      );
      const startedAt = Date.now();
      let sawRateLimited = false;
      let lastCode: OcrErrorCode = "OCR_MODEL_UNAVAILABLE";

      for (let index = 0; index < chain.length; index += 1) {
        const model = chain[index];
        if (!model) break;

        /* Time budget guard: another attempt must still fit the route budget.
           Fallback only triggers on fast-fail errors, so this rarely blocks. */
        if (Date.now() - startedAt + OCR_TIMEOUT_MS > OCR_CHAIN_BUDGET_MS) break;

        const controller = new AbortController();
        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await withTimeout(
            ai.models.generateContent({
              model,
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: PROMPT },
                    {
                      inlineData: {
                        mimeType,
                        data: Buffer.from(imageBytes).toString("base64"),
                      },
                    },
                  ],
                },
              ],
              config: {
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA,
                /* thinkingConfig omitted on purpose: gemini-3.5-flash-lite rejects
                   thinkingBudget: 0 with HTTP 400 INVALID_ARGUMENT. The model default
                   is fast enough; the 9 s timeout stays the latency guard. */
                abortSignal: controller.signal,
              },
            }),
            OCR_TIMEOUT_MS,
          );

          const text = response.text;
          if (!text) return { ok: false, errorCode: "OCR_INVALID_OUTPUT" };
          try {
            return { ok: true, model, raw: JSON.parse(text) };
          } catch {
            return { ok: false, errorCode: "OCR_INVALID_OUTPUT" };
          }
        } catch (error) {
          /* Secret-free diagnostic: never log the API key, image bytes,
             base64, or prompt. */
          const status = providerStatus(error);
          console.error("[ocr] gemini request failed", {
            model,
            status,
            message: error instanceof Error ? error.message : String(error),
          });
          if (status === 429) sawRateLimited = true;
          lastCode = classify(error);

          const next = chain[index + 1];
          if (!next || !isModelFallbackWorthy(error)) break;
          console.warn("[ocr] model fallback", { from: model, to: next, status });
        } finally {
          controller.abort();
        }
      }

      /* Final error precedence: any 429 attempt wins, else the last code. */
      return {
        ok: false,
        errorCode: sawRateLimited ? "OCR_RATE_LIMITED" : lastCode,
      };
    },
  };
}
