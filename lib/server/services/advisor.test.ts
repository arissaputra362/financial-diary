import { describe, expect, it } from "vitest";
import { advisorInsightRequestSchema } from "../contracts/advisor";
import { AdvisorService, hasForbiddenPhrase } from "./advisor";
import { createFakeAdvisorProvider, createFakePlanning } from "../testing/fakes";
import type { AdvisorGeneration } from "../providers/advisor";
import type { PlanningRepositories } from "../repositories/ledger";
import type { PlanningTransaction, ServiceResult } from "./types";
import { AppError } from "../errors";
import type { AdvisorInsightResponseDTO } from "@/types/api";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const ACTOR = { userId: USER, householdId: HOUSEHOLD };
const OTHER = { userId: USER, householdId: "22222222-2222-4222-8222-222222222222" };

const PERIOD = { start: "2026-10-01", end: "2026-10-07" };

const VALID_OUTPUT = {
  headline: "Pengeluaran makanmu turun dibanding awal bulan.",
  summary: "Seminggu ini kamu memasak sendiri lebih sering. Ayo pertahankan.",
  actions: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }] as Array<{ label: string; type: "VIEW_GOAL" | "REVIEW_SPENDING" | "NONE" }>,
  limitations: "Ini bukan nasihat keuangan profesional dan dihitung dari catatan keluarga sendiri.",
  sourcePeriod: PERIOD,
};

function setup(providerResult: AdvisorGeneration | Error = { ok: true, model: "fake-model", raw: VALID_OUTPUT }) {
  const { provider, insight } = createFakeAdvisorProvider(providerResult);
  const { repos, transaction, store } = createFakePlanning();
  const service = new AdvisorService(repos as PlanningRepositories, transaction as PlanningTransaction, provider);
  return { service, store, provider, insight };
}

function insightBody(result: ServiceResult): AdvisorInsightResponseDTO {
  return result.body as unknown as AdvisorInsightResponseDTO;
}

/** Asserts the failure is the typed AppError and returns it for code checks. */
function serviceError(error: unknown): AppError {
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

/** Ensure generatedAt strictly increases so prune ordering is deterministic. */
function ageLastRow(store: { insights: Array<{ generatedAt: Date }> }, index: number): void {
  store.insights[store.insights.length - 1]?.generatedAt.setTime(index * 1_000);
}

describe("AdvisorService period validation (AC-F4-5)", () => {
  it("rejects a period longer than 90 days", () => {
    expect(
      advisorInsightRequestSchema.safeParse({ period: { start: "2026-01-01", end: "2026-05-10" } }).success,
    ).toBe(false);
  });

  it("rejects start > end", () => {
    expect(
      advisorInsightRequestSchema.safeParse({ period: { start: "2026-10-10", end: "2026-10-01" } }).success,
    ).toBe(false);
  });

  it("accepts start == end (single day)", () => {
    expect(
      advisorInsightRequestSchema.safeParse({ period: { start: "2026-10-01", end: "2026-10-01" } }).success,
    ).toBe(true);
  });
});

describe("AdvisorService FRESH path (AC-F4-5, AC-F4-6)", () => {
  it("builds the full insight response and persists only on success", async () => {
    const { service, store, insight } = setup();
    const result: ServiceResult = await service.getInsight(ACTOR, PERIOD);
    expect(result.status).toBe(200);
    const body = insightBody(result);
    expect(body.delivery).toBe("FRESH");
    expect(body.insight.headline).toBeTruthy();
    expect(body.insight.actions.length).toBeGreaterThanOrEqual(1);
    expect(body.insight.actions[0]?.type).toBe("VIEW_GOAL");
    /* sourcePeriod is owned by the request, never drifted by the model. */
    expect(body.insight.sourcePeriod).toEqual(PERIOD);
    expect(body.insight.model).toBe("fake-model");
    expect(body.insight.limitations).toContain("bukan nasihat keuangan");
    expect(body.insight.limitations).not.toMatch(/dijamin|pasti hemat|sesuai ojk/i);

    expect(store.insights).toHaveLength(1);
    const row = store.insights[0];
    const expectedExpiry = new Date(new Date(body.insight.generatedAt).getTime() + 24 * 3_600_000);
    expect(row?.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    expect(insight).toHaveBeenCalledOnce();
  });

  it("sends AGGREGATES to the model, never per-record rows (AC-F4-5)", async () => {
    const { service, insight } = setup();
    await service.getInsight(ACTOR, PERIOD);
    const call = insight.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call?.totalInMinor).toBeDefined();
    expect(call?.totalOutMinor).toBeDefined();
    expect(call?.budgetMinor).toBeDefined();
    expect(Array.isArray(call?.activeGoals)).toBe(true);
    const json = JSON.stringify(insight.mock.calls[0]?.[0] ?? {});
    expect(json).not.toMatch(/merchant|occurredAt|transferGroupId/);
  });

  it("reports zero totals for an empty period, so honesty stays with the model input", async () => {
    const { service, insight } = setup();
    await service.getInsight(ACTOR, PERIOD);
    expect(insight.mock.calls[0]?.[0]?.totalInMinor).toBe(0);
    expect(insight.mock.calls[0]?.[0]?.totalOutMinor).toBe(0);
  });
});

describe("AdvisorService cache semantics (AC-F4-6)", () => {
  it("delivery=CACHE only for the same period + unexpired; other periods stay FRESH", async () => {
    const { service } = setup();
    expect(insightBody(await service.getInsight(ACTOR, PERIOD)).delivery).toBe("FRESH");

    const repeat = insightBody(await service.getInsight(ACTOR, PERIOD));
    expect(repeat.delivery).toBe("CACHE");
    expect(repeat.insight.sourcePeriod).toEqual(PERIOD);

    const otherPeriod = insightBody(await service.getInsight(ACTOR, { start: "2026-10-08", end: "2026-10-10" }));
    expect(otherPeriod.delivery).toBe("FRESH");
  });

  it("never uses an expired cache (AC-F4-6)", async () => {
    const { service, store } = setup();
    await service.getInsight(ACTOR, PERIOD);
    const row = store.insights[0];
    if (row) {
      row.generatedAt = new Date(Date.now() - 48 * 3_600_000);
      row.expiresAt = new Date(Date.now() - 24 * 3_600_000);
    }
    const after = insightBody(await service.getInsight(ACTOR, PERIOD));
    expect(after.delivery).toBe("FRESH");
    expect(store.insights.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps household A and household B caches separate", async () => {
    const { service, store } = setup();
    await service.getInsight(ACTOR, PERIOD);
    const otherBody = insightBody(await service.getInsight(OTHER, PERIOD));
    expect(otherBody.delivery).toBe("FRESH");
    expect(store.insights).toHaveLength(2);
  });
});

describe("AdvisorService failure handling (AC-F4-7)", () => {
  it("maps a rate limit with no cache to typed 429 ADVISOR_RATE_LIMITED", async () => {
    const { service } = setup({ ok: false, errorCode: "ADVISOR_RATE_LIMITED" });
    const failure = serviceError(
      await service.getInsight(ACTOR, PERIOD).catch((caught: unknown) => caught),
    );
    expect(failure.code).toBe("ADVISOR_RATE_LIMITED");
    expect(failure.statusCode).toBe(429);
  });

  it("maps an unavailable model to 503 and never persists a failed insight", async () => {
    const { service, store } = setup({ ok: false, errorCode: "ADVISOR_UNAVAILABLE" });
    const failure = serviceError(
      await service.getInsight(ACTOR, PERIOD).catch((caught: unknown) => caught),
    );
    expect(failure.code).toBe("ADVISOR_UNAVAILABLE");
    expect(failure.statusCode).toBe(503);
    expect(store.insights).toHaveLength(0);
  });

  it("falls back to an unexpired cache for the requested period with delivery=CACHE", async () => {
    const { service, store } = setup({ ok: false, errorCode: "ADVISOR_UNAVAILABLE" });
    store.insights.push({
      id: "insight-seed",
      householdId: HOUSEHOLD,
      requestedByUserId: USER,
      sourcePeriodStart: new Date("2026-10-01T00:00:00.000Z"),
      sourcePeriodEnd: new Date("2026-10-07T00:00:00.000Z"),
      model: "seed",
      headline: "Insight tersimpan sebelumnya.",
      summary: "Ringkasan tersimpan.",
      actionsJson: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
      limitations: "Bukan nasihat keuangan profesional.",
      generatedAt: new Date(1000),
      expiresAt: new Date(Date.now() + 12 * 3_600_000),
    });
    const result: ServiceResult = await service.getInsight(ACTOR, PERIOD);
    expect(result.status).toBe(200);
    const body = insightBody(result);
    expect(body.delivery).toBe("CACHE");
    expect(body.insight.headline).toBe("Insight tersimpan sebelumnya.");
  });

  it("with malformed model output: the failure stays typed, 422, and un-cached", async () => {
    const { service, store } = setup({
      ok: true,
      model: "fake-model",
      raw: { headline: "", summary: "", actions: [], limitations: "", sourcePeriod: PERIOD },
    });
    const failure = serviceError(
      await service.getInsight(ACTOR, PERIOD).catch((caught: unknown) => caught),
    );
    expect(failure.code).toBe("ADVISOR_INVALID_OUTPUT");
    expect(failure.statusCode).toBe(422);
    expect(store.insights).toHaveLength(0);
  });

  it("rejects output with zero actions (actions >= 1, AC-F4-8)", async () => {
    const { service, store } = setup({
      ok: true,
      model: "fake-model",
      raw: { ...VALID_OUTPUT, actions: [] },
    });
    const failure = serviceError(
      await service.getInsight(ACTOR, PERIOD).catch((caught: unknown) => caught),
    );
    expect(failure.code).toBe("ADVISOR_INVALID_OUTPUT");
    expect(store.insights).toHaveLength(0);
  });

  it("blacklist assert: forbidden phrases make the output invalid (AC-F4-8)", async () => {
    const { service, store } = setup({
      ok: true,
      model: "fake-model",
      raw: { ...VALID_OUTPUT, headline: "Cara ini pasti hemat bulan ini." },
    });
    const failure = serviceError(
      await service.getInsight(ACTOR, PERIOD).catch((caught: unknown) => caught),
    );
    expect(failure.code).toBe("ADVISOR_INVALID_OUTPUT");
    expect(store.insights).toHaveLength(0);
  });

  it("blacklist helper is case-insensitive and matches only the exact phrases", () => {
    expect(hasForbiddenPhrase(["Sesuatu DIJAMIN berjalan."])).toBe(true);
    expect(hasForbiddenPhrase(["pasti hemat bulan ini"])).toBe(true);
    expect(hasForbiddenPhrase(["sesuai OJK"])).toBe(true);
    /* A plain word like "hemat" alone is fine. */
    expect(hasForbiddenPhrase(["Hemat yang realistis, tanpa janji."])).toBe(false);
  });
});

describe("AdvisorService prune-on-create (AC-F4-6 / D-16)", () => {
  it("keeps only the 10 newest insights for the household", async () => {
    const { service, store } = setup();
    for (let day = 1; day <= 11; day += 1) {
      const dateOnly = `2026-09-${String(day).padStart(2, "0")}`;
      const result = await service.getInsight(ACTOR, { start: dateOnly, end: dateOnly });
      expect(result.status).toBe(200);
      ageLastRow(store as { insights: Array<{ generatedAt: Date }> }, day);
    }
    expect(store.insights).toHaveLength(10);
    /* The oldest (day 1) is pruned. */
    expect(
      store.insights.some((row) => row.sourcePeriodStart.getTime() === new Date("2026-09-01T00:00:00.000Z").getTime()),
    ).toBe(false);
  });

  it("prune isolates households (other household's rows untouched)", async () => {
    const { service, store } = setup();

    /* Household B already holds 10 insights from its own earlier requests. */
    for (let i = 1; i <= 10; i += 1) {
      store.insights.push({
        id: `seed-b-${i}`,
        householdId: OTHER.householdId,
        requestedByUserId: USER,
        sourcePeriodStart: new Date(`2026-07-${String(i).padStart(2, "0")}T00:00:00.000Z`),
        sourcePeriodEnd: new Date(`2026-07-${String(i).padStart(2, "0")}T00:00:00.000Z`),
        model: "seed",
        headline: `Insight B ${i}`,
        summary: "Ringkasan B.",
        actionsJson: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
        limitations: "Bukan nasihat keuangan profesional.",
        generatedAt: new Date(i * 1_000),
        expiresAt: new Date(i * 1_000 + 365 * 86_400_000),
      });
    }

    /* Household A generates 11 insights; only A's rows may ever be pruned. */
    for (let day = 1; day <= 11; day += 1) {
      const dateOnly = `2026-09-${String(day).padStart(2, "0")}`;
      const result = await service.getInsight(ACTOR, { start: dateOnly, end: dateOnly });
      expect(result.status).toBe(200);
      const lastA = [...store.insights]
        .filter((row) => row.householdId === HOUSEHOLD)
        .at(-1);
      lastA?.generatedAt.setTime(day * 1_000);
    }

    const aRows = store.insights.filter((row) => row.householdId === HOUSEHOLD);
    const bRows = store.insights.filter((row) => row.householdId === OTHER.householdId);
    expect(aRows).toHaveLength(10);
    expect(
      aRows.some((row) => row.sourcePeriodStart.getTime() === new Date("2026-09-01T00:00:00.000Z").getTime()),
    ).toBe(false);
    /* B keeps all 10 seeded insights, intact. */
    expect(bRows).toHaveLength(10);
    expect(bRows.some((row) => row.headline === "Insight B 1")).toBe(true);
  });
});
