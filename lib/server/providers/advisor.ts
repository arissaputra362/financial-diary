/*
  AdvisorProvider seam (ADR-003, feat-goals-advisor). The real implementation
  calls Gemini with structured output; tests inject the fake provider
  (`lib/server/testing/planning-fakes.ts`) and the route never wires a fake.

  Fail-closed: every failure becomes a typed advisor error code, never invented
  advice. Only period AGGREGATES are sent to the model (AC-F4-5); per-record
  transaction rows never leave the service. Bounded model fallback: only
  model-specific failures (HTTP 429/404/503) may move to the next configured
  model, at most once each, max 3 models (AC-7b).
*/

import { GoogleGenAI, Type } from "@google/genai";
import type { AdvisorErrorCode } from "../contracts/common";
import { isModelFallbackWorthy, providerStatus, resolveModelChain } from "./model-chain";

export type AdvisorActionType = "VIEW_GOAL" | "REVIEW_SPENDING" | "NONE";

/** Aggregate-only input for the model (AC-F4-5: never per-record rows). */
export type AdvisorAggregate = {
  period: { start: string; end: string };
  totalInMinor: number;
  totalOutMinor: number;
  /** Budget of the month touching the period, null when unset/not applicable. */
  budgetMinor: number | null;
  activeGoals: Array<{ name: string; progressPercent: number }>;
};

export type AdvisorGeneration =
  | { ok: true; model: string; raw: unknown }
  | { ok: false; errorCode: AdvisorErrorCode };

export interface AdvisorProvider {
  insight(aggregate: AdvisorAggregate): Promise<AdvisorGeneration>;
}

/** Explicit per-attempt timeout (ADR-003 budget, advisor ~9 s of the 20 s tx). */
export const ADVISOR_TIMEOUT_MS = 9_000;

/** Time budget for the whole bounded chain (idempotency transaction ~20 s). */
const ADVISOR_CHAIN_BUDGET_MS = 19_000;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, nullable: false },
    summary: { type: Type.STRING, nullable: false },
    actions: {
      type: Type.ARRAY,
      nullable: false,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, nullable: false },
          type: { type: Type.STRING, nullable: false },
        },
        required: ["label", "type"],
      },
    },
    limitations: { type: Type.STRING, nullable: false },
    sourcePeriod: {
      type: Type.OBJECT,
      nullable: false,
      properties: {
        start: { type: Type.STRING, nullable: false },
        end: { type: Type.STRING, nullable: false },
      },
      required: ["start", "end"],
    },
  },
  required: ["headline", "summary", "actions", "limitations", "sourcePeriod"],
};

const PROMPT = [
  "Kamu Finny, asisten keuangan keluarga. Diberikan data agregat pengeluaran untuk satu periode.",
  "Tulis insight dengan bahasa awam Indonesia yang suportif, tanpa istilah keuangan teknis.",
  "Aturan penting:",
  "- Data yang diberikan hanya angka total. Jangan mengarang statistik atau angka yang tidak ada di data.",
  "- Jika total uang masuk dan uang keluar 0, nyatakan saja bahwa data tidak cukup untuk analisis. Jangan memberi saran apa pun.",
  "- Buat 1 sampai 3 aksi. type harus salah satu dari VIEW_GOAL, REVIEW_SPENDING, NONE. Kamu TIDAK BOLEH memindahkan uang, mengatur target, atau membuat pengingat.",
  "- limitations WAJIB menyatakan bahwa ini bukan nasihat keuangan profesional dan diperhitungkan dari data keluarga itu sendiri.",
  "- sourcePeriod isi persis dengan periode yang diberikan.",
  "- Jangan pernah menggunakan kata 'dijamin', 'pasti hemat', atau 'sesuai OJK'.",
  "- Tidak ada bahasa yang menjanjikan hasil atau memakai nada regulasi.",
].join("\n");

class AdvisorProviderTimeoutError extends Error {
  constructor() {
    super("Advisor provider timed out.");
    this.name = "AdvisorProviderTimeoutError";
  }
}

function classify(error: unknown): AdvisorErrorCode {
  if (error instanceof AdvisorProviderTimeoutError) return "ADVISOR_UNAVAILABLE";
  const record = error as { name?: string; status?: number; message?: string } | null;
  if (record?.name === "AbortError" || (typeof record?.message === "string" && /timeout|timed out|aborted/i.test(record.message))) {
    return "ADVISOR_UNAVAILABLE";
  }
  const status = record?.status;
  /* Pass-through of Gemini rate limiting only (AC-F4-7, D-19). */
  if (status === 429) return "ADVISOR_RATE_LIMITED";
  return "ADVISOR_UNAVAILABLE";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AdvisorProviderTimeoutError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createGeminiAdvisorProvider(): AdvisorProvider {
  return {
    async insight(aggregate): Promise<AdvisorGeneration> {
      /* Fail-closed: missing credential is a model-unavailable condition.
         Never configured, never a single HTTP call. */
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return { ok: false, errorCode: "ADVISOR_UNAVAILABLE" };

      const chain = resolveModelChain(
        process.env.GEMINI_MODEL,
        process.env.GEMINI_MODEL_FALLBACKS,
      );
      const startedAt = Date.now();
      let sawRateLimited = false;
      let lastCode: AdvisorErrorCode = "ADVISOR_UNAVAILABLE";

      for (let index = 0; index < chain.length; index += 1) {
        const model = chain[index];
        if (!model) break;

        /* Time budget guard: another attempt must still fit the ~20 s advisor
           transaction. Fallback only triggers on fast-fail errors. */
        if (Date.now() - startedAt + ADVISOR_TIMEOUT_MS > ADVISOR_CHAIN_BUDGET_MS) break;

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
                    { text: `Data agregat (JSON): ${JSON.stringify(aggregate)}` },
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
            ADVISOR_TIMEOUT_MS,
          );

          const text = response.text;
          if (!text) return { ok: false, errorCode: "ADVISOR_INVALID_OUTPUT" };
          try {
            return { ok: true, model, raw: JSON.parse(text) };
          } catch {
            return { ok: false, errorCode: "ADVISOR_INVALID_OUTPUT" };
          }
        } catch (error) {
          /* Secret-free diagnostic: never log the API key or aggregate payload. */
          const status = providerStatus(error);
          console.error("[advisor] gemini request failed", {
            model,
            status,
            message: error instanceof Error ? error.message : String(error),
          });
          if (status === 429) sawRateLimited = true;
          lastCode = classify(error);

          const next = chain[index + 1];
          if (!next || !isModelFallbackWorthy(error)) break;
          console.warn("[advisor] model fallback", { from: model, to: next, status });
        } finally {
          controller.abort();
        }
      }

      /* Final error precedence: any 429 attempt wins, else the last code. */
      return {
        ok: false,
        errorCode: sawRateLimited ? "ADVISOR_RATE_LIMITED" : lastCode,
      };
    },
  };
}
