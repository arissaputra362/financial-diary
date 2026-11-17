import { describe, expect, it } from "vitest";
import { PeriodService } from "./period";
import { ReportService } from "./report";
import { createDashboardFakeStore, fakeTransaction } from "../testing/dashboard-fakes";
import { createReportFake, fakeReportWallet } from "../testing/report-fakes";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const SHARED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function at(date: string): Date {
  return new Date(`${date}T12:00:00+07:00`);
}

function buildHarness() {
  const store = createDashboardFakeStore();
  store.wallets.push(
    fakeReportWallet({
      id: SHARED,
      householdId: HOUSEHOLD,
      createdByUserId: USER,
      scope: "SHARING",
      openingBalanceMinor: 1_000_000,
      createdAt: at("2026-01-01"),
    }),
  );
  store.transactions.push(
    fakeTransaction({
      householdId: HOUSEHOLD,
      createdByUserId: USER,
      walletId: SHARED,
      type: "MONEY_IN",
      amountMinor: 100_000,
      occurredAt: at("2026-09-15"),
    }),
    fakeTransaction({
      householdId: HOUSEHOLD,
      createdByUserId: USER,
      walletId: SHARED,
      type: "MONEY_OUT",
      amountMinor: 40_000,
      occurredAt: at("2026-10-20"),
    }),
    fakeTransaction({
      householdId: HOUSEHOLD,
      createdByUserId: USER,
      walletId: SHARED,
      type: "MONEY_IN",
      amountMinor: 25_000,
      occurredAt: at("2026-11-15"),
    }),
  );
  return {
    reports: new ReportService(createReportFake(store), new PeriodService()),
    actor: { userId: USER, householdId: HOUSEHOLD, role: "OWNER" },
  };
}

describe("ReportService.activityWalletSummary", () => {
  it("summarises an explicit range so rolling windows keep their own totals", async () => {
    const { reports, actor } = buildHarness();

    const summary = await reports.activityWalletSummary(actor, {
      from: "2026-10-18",
      to: "2026-11-16",
      scope: "all",
      walletIds: [],
    });

    expect(summary).toEqual({
      openingMinor: 1_100_000,
      moneyInMinor: 25_000,
      moneyOutMinor: 40_000,
      closingMinor: 1_085_000,
    });
  });

  it("keeps the calendar-month summary when no range is given", async () => {
    const { reports, actor } = buildHarness();

    const summary = await reports.activityWalletSummary(actor, {
      month: "2026-11",
      scope: "all",
      walletIds: [],
    });

    expect(summary).toEqual({
      openingMinor: 1_060_000,
      moneyInMinor: 25_000,
      moneyOutMinor: 0,
      closingMinor: 1_085_000,
    });
  });
});
