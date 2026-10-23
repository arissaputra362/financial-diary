import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, type AuthenticatedContext } from "@/lib/server/auth";
import { BudgetService } from "@/lib/server/services/budget";
import { DashboardService } from "@/lib/server/services/dashboard";
import { PeriodService } from "@/lib/server/services/period";
import {
  createDashboardFake,
  createDashboardFakeStore,
  fakeTransaction,
} from "@/lib/server/testing/dashboard-fakes";
import { GET as dashboardGet } from "./route";
import { GET as budgetGet, PUT as budgetPut } from "../budget/route";

vi.mock("@/lib/server/auth", () => ({
  createServices: vi.fn(),
  authenticatedRequest: vi.fn(),
}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";

type Harness = ReturnType<typeof buildHarness>;

function buildHarness(role = "OWNER") {
  const store = createDashboardFakeStore();
  const fake = createDashboardFake(store);
  const periods = new PeriodService();
  const budget = new BudgetService(fake.budget, fake.personalBudget, fake.transaction, periods);
  const context: AuthenticatedContext = {
    state: {
      user: { id: USER, email: "ana@example.com", displayName: "Ana" },
      household: { id: HOUSEHOLD, name: "Keluarga Ana" },
      role,
      status: "APPROVED",
      nextAction: "OPEN_HOME",
    },
    userId: USER,
    householdId: HOUSEHOLD,
    role,
    sessionId: "sid-1",
    auth: {} as AuthenticatedContext["auth"],
    family: {} as AuthenticatedContext["family"],
    transactions: {} as AuthenticatedContext["transactions"],
    wallets: {} as AuthenticatedContext["wallets"],
    institutions: {} as AuthenticatedContext["institutions"],
    ocr: {} as AuthenticatedContext["ocr"],
    dashboard: new DashboardService(
      { transaction: fake.transaction, wallet: fake.wallet },
      fake.goal,
      budget,
      periods,
    ),
    budget,
    goals: {} as AuthenticatedContext["goals"],
    advisor: {} as AuthenticatedContext["advisor"],
  };
  return { context, store };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/budget", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-change";
});

describe("GET /api/dashboard", () => {
  let harness: Harness;
  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("returns the full DashboardDTO for an approved member (AC-F2-1..AC-F2-9)", async () => {
    harness.store.transactions.push(
      fakeTransaction({ householdId: HOUSEHOLD, type: "MONEY_IN", amountMinor: 1_000_000, occurredAt: new Date() }),
    );
    const response = await dashboardGet(new Request("http://localhost/api/dashboard"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      sharedBalanceMinor: 1_000_000,
      personalBalanceMinor: 0,
      currencyCode: "IDR",
      monthlyBudget: { isSet: false, budgetMinor: null, remainingMinor: null },
    });
    expect(body.monthlyBudget.scope).toBe("SHARED");
    expect(body.personalMonthlyBudget).toMatchObject({ scope: "PERSONAL", isSet: false });
    expect(body.personalSpending).toMatchObject({ totalOutMinor: 0 });
    expect(body.spending.byDay).toHaveLength(7);
    expect(body.personalSpending.byDay).toHaveLength(7);
    expect(Array.isArray(body.goals)).toBe(true);
    expect(Array.isArray(body.recentActivity)).toBe(true);
    expect(response.headers.get("set-cookie") ?? "").toContain("financial_planner_session=");
  });

  it("honours the period query param and defaults to 7D", async () => {
    const ninety = await (await dashboardGet(new Request("http://localhost/api/dashboard?period=90D"))).json();
    expect(ninety.spending.byDay).toHaveLength(90);
    const invalid = await dashboardGet(new Request("http://localhost/api/dashboard?period=365D"));
    expect(invalid.status).toBe(422);
  });

  it("maps a PENDING member to a typed 403", async () => {
    const { forbidden } = await import("@/lib/server/errors");
    vi.mocked(authenticatedRequest).mockRejectedValue(
      forbidden("ACCESS_PENDING", "Akun Anda belum memiliki akses ke data keluarga."),
    );
    const response = await dashboardGet(new Request("http://localhost/api/dashboard"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCESS_PENDING" } });
  });
});

describe("GET/PUT /api/budget", () => {
  let harness: Harness;
  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
  });

  it("defaults GET to the shared scope", async () => {
    const response = await budgetGet(new Request("http://localhost/api/budget"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scope: "SHARED",
      isSet: false,
      spentMinor: 0,
    });
  });

  it("returns the personal scope when requested (AC-F2-2c)", async () => {
    const response = await budgetGet(new Request("http://localhost/api/budget?scope=personal"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scope: "PERSONAL",
      isSet: false,
      spentMinor: 0,
    });
  });

  it("rejects an invalid scope with 422", async () => {
    const response = await budgetGet(new Request("http://localhost/api/budget?scope=family"));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("upserts for the owner and returns the updated shared DTO (AC-F2-3)", async () => {
    const response = await budgetPut(jsonRequest({ amountMinor: 2_500_000 }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scope: "SHARED",
      isSet: true,
      budgetMinor: 2_500_000,
      remainingMinor: 2_500_000,
    });
  });

  it("returns 403 when a member tries to write the shared budget (AC-F2-3)", async () => {
    harness = buildHarness("MEMBER");
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const response = await budgetPut(jsonRequest({ amountMinor: 100_000 }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCESS_DENIED" } });
    expect(harness.store.budgets).toHaveLength(0);
  });

  it("lets a member write their own personal budget (AC-F2-2c)", async () => {
    harness = buildHarness("MEMBER");
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const response = await budgetPut(jsonRequest({ amountMinor: 300_000, scope: "personal" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scope: "PERSONAL",
      isSet: true,
      budgetMinor: 300_000,
    });
    expect(harness.store.personalBudgets).toHaveLength(1);
    expect(harness.store.personalBudgets[0]?.userId).toBe(USER);
    expect(harness.store.budgets).toHaveLength(0);
  });

  it("ignores a client userId and writes only the session user's personal row", async () => {
    harness = buildHarness("MEMBER");
    vi.mocked(authenticatedRequest).mockResolvedValue(harness.context);
    const response = await budgetPut(
      jsonRequest({ amountMinor: 250_000, scope: "personal", userId: OTHER_USER }),
    );
    expect(response.status).toBe(200);
    expect(harness.store.personalBudgets).toHaveLength(1);
    expect(harness.store.personalBudgets[0]?.userId).toBe(USER);
  });

  it("does not expose another user's personal budget to the owner", async () => {
    harness.store.personalBudgets.push({
      id: "pb-other",
      householdId: HOUSEHOLD,
      userId: OTHER_USER,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      amountMinor: 9_000_000,
      createdByUserId: OTHER_USER,
    });
    const response = await budgetGet(new Request("http://localhost/api/budget?scope=personal"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scope: "PERSONAL",
      isSet: false,
      budgetMinor: null,
    });
  });

  it("rejects amount 0 with 422 and a plain-language fieldError (AC-F2-3)", async () => {
    const response = await budgetPut(jsonRequest({ amountMinor: 0 }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { fieldErrors: { amountMinor: ["Budget harus lebih dari 0."] } },
    });
  });
});
