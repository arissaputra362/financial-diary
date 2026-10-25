import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import { AdvisorService } from "@/lib/server/services/advisor";
import { createFakeAdvisorProvider, createFakePlanning, createFakeStore } from "@/lib/server/testing/fakes";
import type { PlanningRepositories, PlanningTransaction } from "@/lib/server/services/types";
import { POST as insightsPost } from "./insights/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";

const VALID_OUTPUT = {
  headline: "Pengeluaran makanmu turun.",
  summary: "Ayo pertahankan memasak sendiri.",
  actions: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
  limitations: "Ini bukan nasihat keuangan profesional.",
  sourcePeriod: { start: "2026-10-01", end: "2026-10-07" },
};

type Harness = ReturnType<typeof buildHarness>;

function buildHarness(providerResult?: import("@/lib/server/providers/advisor").AdvisorGeneration | Error) {
  const store = createFakeStore();
  const { repos, transaction } = createFakePlanning(store);
  const { provider, insight } = createFakeAdvisorProvider(
    providerResult ?? { ok: true, model: "fake-model", raw: VALID_OUTPUT },
  );
  const context: AuthenticatedContext = {
    state: {
      user: { id: USER, email: "ana@example.com", displayName: "Ana" },
      household: { id: HOUSEHOLD, name: "Keluarga Ana" },
      role: "OWNER",
      status: "APPROVED",
      nextAction: "OPEN_HOME",
    },
    userId: USER,
    householdId: HOUSEHOLD,
    role: "OWNER",
    sessionId: "sid-1",
    auth: {} as AuthenticatedContext["auth"],
    family: {} as AuthenticatedContext["family"],
    transactions: {} as AuthenticatedContext["transactions"],
    wallets: {} as AuthenticatedContext["wallets"],
    institutions: {} as AuthenticatedContext["institutions"],
    ocr: {} as AuthenticatedContext["ocr"],
    dashboard: {} as AuthenticatedContext["dashboard"],
    reports: {} as AuthenticatedContext["reports"],
    budget: {} as AuthenticatedContext["budget"],
    goals: {} as AuthenticatedContext["goals"],
    advisor: new AdvisorService(
      repos as PlanningRepositories,
      transaction as PlanningTransaction,
      provider,
    ),
  };
  return { context, store, insight };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/advisor/insights", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const periodBody = { period: { start: "2026-10-01", end: "2026-10-07" } };

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("POST /api/advisor/insights (AC-F4-5..7)", () => {
  let harness: Harness;

  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("returns { insight, delivery: FRESH } with every required field (AC-F4-5/6)", async () => {
    const response = await insightsPost(jsonRequest(periodBody));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.delivery).toBe("FRESH");
    expect(body.insight).toMatchObject({
      headline: VALID_OUTPUT.headline,
      summary: VALID_OUTPUT.summary,
      limitations: VALID_OUTPUT.limitations,
      sourcePeriod: { start: "2026-10-01", end: "2026-10-07" },
      model: "fake-model",
    });
    expect(body.insight.actions).toHaveLength(1);
    expect(typeof body.insight.generatedAt).toBe("string");
    expect(typeof body.insight.expiresAt).toBe("string");
  });

  it("returns delivery=CACHE with the cached insight for a repeat period (AC-F4-6)", async () => {
    const first = await insightsPost(jsonRequest(periodBody));
    const second = await insightsPost(jsonRequest(periodBody));
    expect(second.status).toBe(200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.delivery).toBe("CACHE");
    expect(secondBody.insight.headline).toBe(firstBody.insight.headline);
  });

  it("rejects a period longer than 90 days and start>end with 422 (AC-F4-5)", async () => {
    const tooLong = await insightsPost(jsonRequest({ period: { start: "2026-01-01", end: "2026-05-10" } }));
    expect(tooLong.status).toBe(422);
    const inverted = await insightsPost(jsonRequest({ period: { start: "2026-10-10", end: "2026-10-01" } }));
    expect(inverted.status).toBe(422);
  });

  it("returns typed 503 ADVISOR_UNAVAILABLE when the model fails (AC-F4-7)", async () => {
    const failHarness = buildHarness({ ok: false, errorCode: "ADVISOR_UNAVAILABLE" });
    vi.mocked(authenticatedRequest).mockResolvedValueOnce(failHarness.context);
    const response = await insightsPost(jsonRequest(periodBody));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ADVISOR_UNAVAILABLE" } });
    expect(failHarness.store.insights).toHaveLength(0);
  });

  it("returns typed 429 with a filtered pass-through of the rate limit (AC-F4-7)", async () => {
    const failHarness = buildHarness({ ok: false, errorCode: "ADVISOR_RATE_LIMITED" });
    vi.mocked(authenticatedRequest).mockResolvedValueOnce(failHarness.context);
    const response = await insightsPost(jsonRequest(periodBody));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ADVISOR_RATE_LIMITED" } });
  });

  it("returns the cached fallback (delivery=CACHE) even when the model fails (AC-F4-7)", async () => {
    const failHarness = buildHarness({ ok: false, errorCode: "ADVISOR_UNAVAILABLE" });
    failHarness.store.insights.push({
      id: "insight-seed",
      householdId: HOUSEHOLD,
      requestedByUserId: USER,
      sourcePeriodStart: new Date("2026-10-01T00:00:00.000Z"),
      sourcePeriodEnd: new Date("2026-10-07T00:00:00.000Z"),
      model: "seed",
      headline: "Insight tersimpan sebelumnya.",
      summary: "Ringkasan tersimpan.",
      actionsJson: [{ label: "Lihat target tabungan", type: "VIEW_GOAL" }],
      limitations: "Ini bukan nasihat keuangan profesional.",
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 12 * 3_600_000),
    });
    vi.mocked(authenticatedRequest).mockResolvedValueOnce(failHarness.context);
    const response = await insightsPost(jsonRequest(periodBody));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.delivery).toBe("CACHE");
    /* Still a cache of the SAME period, never of another period. */
    expect(body.insight.sourcePeriod).toEqual(periodBody.period);
  });

  it("replays the stored response for the same Idempotency-Key + payload (A-11)", async () => {
    const key = "11111111-2222-4333-8444-555555555555";
    const first = await insightsPost(jsonRequest(periodBody, { "idempotency-key": key }));
    const second = await insightsPost(jsonRequest(periodBody, { "idempotency-key": key }));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(harness.insight).toHaveBeenCalledOnce();
  });

  it("never leaks per-record transaction rows or a raw model prompt (AC-F4-5, AC-F3-9)", async () => {
    const response = await insightsPost(jsonRequest(periodBody));
    const text = JSON.stringify(await response.json());
    expect(text).not.toMatch(/prompt|merchant/);
    expect(harness.insight.mock.calls[0]?.[0]).toMatchObject({ period: periodBody.period });
  });
});
