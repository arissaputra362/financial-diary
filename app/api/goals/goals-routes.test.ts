import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import { GoalService } from "@/lib/server/services/goal";
import { createFakePlanning, createFakeStore } from "@/lib/server/testing/fakes";
import type { PlanningRepositories, PlanningTransaction } from "@/lib/server/services/types";
import { GET as goalsGet, POST as goalsPost } from "./route";
import { PATCH as goalPatch } from "./[id]/route";
import { POST as trashPost } from "./[id]/trash/route";
import { POST as restorePost } from "./[id]/restore/route";
import { GET as trashGet } from "./trash/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";

type Harness = ReturnType<typeof buildHarness>;

function buildHarness() {
  const store = createFakeStore();
  const { repos, transaction } = createFakePlanning(store);
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
    ocr: {} as AuthenticatedContext["ocr"],
    dashboard: {} as AuthenticatedContext["dashboard"],
    budget: {} as AuthenticatedContext["budget"],
    goals: new GoalService(repos as PlanningRepositories, transaction as PlanningTransaction),
    wallets: {} as AuthenticatedContext["wallets"],
    institutions: {} as AuthenticatedContext["institutions"],
    advisor: {} as AuthenticatedContext["advisor"],
  };
  return { context, store };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/goals", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const goalBody = { name: "Dana darurat", targetAmountMinor: 1_000_000 };

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("POST /api/goals (AC-F4-1)", () => {
  let harness: Harness;

  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("returns 201 with a GoalDTO and savedAmountMinor 0", async () => {
    const response = await goalsPost(jsonRequest({ ...goalBody, deadline: "2026-12-31" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      name: "Dana darurat",
      targetAmountMinor: 1_000_000,
      savedAmountMinor: 0,
      progressPercent: 0,
      deadline: "2026-12-31",
      currencyCode: "IDR",
    });
    expect(response.headers.get("set-cookie") ?? "").toContain("financial_planner_session=");
  });

  it("returns 201 for two goals with the same name (AC-F4-1)", async () => {
    const first = await goalsPost(jsonRequest(goalBody));
    const second = await goalsPost(jsonRequest(goalBody));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("returns 422 for target 0 or negative (AC-F4-1)", async () => {
    const response = await goalsPost(jsonRequest({ ...goalBody, targetAmountMinor: 0 }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(JSON.stringify(body)).toContain("Target harus lebih dari 0.");
  });

  it("returns 422 for a deadline that is not YYYY-MM-DD", async () => {
    const response = await goalsPost(jsonRequest({ ...goalBody, deadline: "31-12-2026" }));
    expect(response.status).toBe(422);
  });

  it("replays the original response for the same Idempotency-Key + payload (A-11)", async () => {
    const key = "11111111-2222-4333-8444-555555555555";
    const first = await goalsPost(jsonRequest(goalBody, { "idempotency-key": key }));
    const second = await goalsPost(jsonRequest(goalBody, { "idempotency-key": key }));
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(harness.store.goals).toHaveLength(1);
  });

  it("rejects a malformed Idempotency-Key with 400", async () => {
    const response = await goalsPost(jsonRequest(goalBody, { "idempotency-key": "short" }));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/goals + PATCH + trash/restore", () => {
  let harness: Harness;
  let goalId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const response = await goalsPost(jsonRequest(goalBody));
    goalId = ((await response.json()) as { id: string }).id;
  });

  it("lists active goals (GET)", async () => {
    const response = await goalsGet();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].name).toBe("Dana darurat");
  });

  it("adjusts saved delta and caps progress at 100 in the DTO (AC-F4-2/3)", async () => {
    const delta = await goalPatch(jsonRequest({ savedDelta: 1_500_000 }), params(goalId));
    expect(delta.status).toBe(200);
    const goal = await delta.json();
    expect(goal.savedAmountMinor).toBe(1_500_000);
    expect(goal.progressPercent).toBe(100);
  });

  it("returns 422 SAVED_AMOUNT_INVALID for a negative result (AC-F4-3)", async () => {
    await goalPatch(jsonRequest({ savedDelta: 100 }), params(goalId));
    const response = await goalPatch(jsonRequest({ savedDelta: -101 }), params(goalId));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SAVED_AMOUNT_INVALID" },
    });
  });

  it("returns 422 for a zero delta (savedDelta ≠ 0)", async () => {
    const response = await goalPatch(jsonRequest({ savedDelta: 0 }), params(goalId));
    expect(response.status).toBe(422);
  });

  it("returns 404 for an increment on a trashed goal and for trash in another household", async () => {
    const trashResponse = await trashPost(new Request("http://localhost/x", { method: "POST" }), params(goalId));
    expect(trashResponse.status).toBe(200);
    expect(trashResponse.headers.get("set-cookie") ?? "").toContain("financial_planner_session=");

    const increment = await goalPatch(jsonRequest({ savedDelta: 100 }), params(goalId));
    expect(increment.status).toBe(404);

    const restore = await restorePost(new Request("http://localhost/x", { method: "POST" }), params(goalId));
    expect(restore.status).toBe(200);
  });

  it("trash then GET /api/goals/trash lists the row, restore empties it", async () => {
    await trashPost(new Request("http://localhost/x", { method: "POST" }), params(goalId));
    const trashList = await (await trashGet(new Request("http://localhost/api/goals/trash"))).json();
    expect(trashList.rows).toHaveLength(1);
    const restore = await restorePost(new Request("http://localhost/x", { method: "POST" }), params(goalId));
    expect(restore.status).toBe(200);
    const trashAfter = await (await trashGet(new Request("http://localhost/api/goals/trash"))).json();
    expect(trashAfter.rows).toHaveLength(0);
  });

  it("maps a PENDING member to a typed 403", async () => {
    const { forbidden } = await import("@/lib/server/errors");
    vi.mocked(authenticatedRequest).mockRejectedValue(
      forbidden("ACCESS_PENDING", "Akun Anda belum memiliki akses ke data keluarga."),
    );
    const response = await goalsGet();
    expect(response.status).toBe(403);
  });
});
