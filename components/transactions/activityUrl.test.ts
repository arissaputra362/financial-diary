import { describe, expect, it } from "vitest";
import { activityHref, activityListUrl } from "./activityUrl";

/*
  AC-F3-14: closing the Add sheet removes only the `add` intent. The URL writer
  is the single source for the month/Trash view so those never reset.
*/
describe("activityHref", () => {
  it("keeps the selected month on the active view", () => {
    expect(activityHref({ view: "active", month: "2025-03" })).toBe(
      "/transactions?month=2025-03",
    );
  });

  it("keeps the month and the Trash tab", () => {
    expect(activityHref({ view: "trash", month: "2025-03" })).toBe(
      "/transactions?view=trash&month=2025-03",
    );
  });

  it("adds the intent while preserving the current view", () => {
    expect(activityHref({ view: "trash", month: "2025-03", add: true })).toBe(
      "/transactions?view=trash&month=2025-03&add=1",
    );
  });

  it("omits add entirely when the intent is consumed", () => {
    const href = activityHref({ view: "active", month: "2025-03" });
    expect(href).not.toContain("add=");
  });

  it("keeps an optional date range in the deep link", () => {
    expect(
      activityHref({
        view: "active",
        month: "2025-03",
        from: "2025-03-10",
        to: "2025-03-20",
      }),
    ).toBe("/transactions?month=2025-03&from=2025-03-10&to=2025-03-20");
  });

  it("writes the Ringkasan tab with its month and selected scope/wallet (AC-F7-1/7/8)", () => {
    expect(activityHref({ view: "ringkasan", month: "2026-10" })).toBe(
      "/transactions?view=ringkasan&month=2026-10",
    );
    expect(
      activityHref({
        view: "ringkasan",
        month: "2026-10",
        reportScope: "personal",
        walletId: "0f0f0f0f-0000-4000-8000-000000000001",
      }),
    ).toBe(
      "/transactions?view=ringkasan&month=2026-10&scope=personal&wallet=0f0f0f0f-0000-4000-8000-000000000001",
    );
  });

  it("writes the active tab type filter and wallet for Lihat semua pengeluaran (AC-F7-6)", () => {
    expect(
      activityHref({
        view: "active",
        month: "2026-10",
        filter: "out",
        walletId: "0f0f0f0f-0000-4000-8000-000000000001",
      }),
    ).toBe(
      "/transactions?view=active&month=2026-10&filter=out&wallet=0f0f0f0f-0000-4000-8000-000000000001",
    );
  });

  it("never writes filter, scope, or wallet on the Trash tab", () => {
    expect(
      activityHref({
        view: "trash",
        month: "2026-10",
        filter: "out",
        reportScope: "personal",
        walletId: "0f0f0f0f-0000-4000-8000-000000000001",
      }),
    ).toBe("/transactions?view=trash&month=2026-10");
  });

  it("keeps the Ringkasan context when the Add intent is added (AC-F7-2)", () => {
    expect(
      activityHref({
        view: "ringkasan",
        month: "2026-10",
        reportScope: "personal",
        walletId: "0f0f0f0f-0000-4000-8000-000000000001",
        add: true,
      }),
    ).toBe(
      "/transactions?view=ringkasan&month=2026-10&scope=personal&wallet=0f0f0f0f-0000-4000-8000-000000000001&add=1",
    );
  });
});

/*
  Regression: an untouched date filter is an empty string, not `undefined`.
  The list request must fall back to the whole selected month, otherwise the
  API rejects `from=` / `to=` and the page shows a load error.
*/
describe("activityListUrl", () => {
  it("uses the selected month when no date filter is applied", () => {
    expect(activityListUrl({ view: "active", month: "2025-02" })).toBe(
      "/api/transactions?from=2025-02-01&to=2025-02-28",
    );
  });

  it("falls back to the month for empty date strings", () => {
    expect(activityListUrl({ view: "active", month: "2026-10", from: "", to: "" })).toBe(
      "/api/transactions?from=2026-10-01&to=2026-10-31",
    );
  });

  it("keeps an applied date range inside the month", () => {
    expect(
      activityListUrl({ view: "active", month: "2025-03", from: "2025-03-10", to: "2025-03-20" }),
    ).toBe("/api/transactions?from=2025-03-10&to=2025-03-20");
  });

  it("maps Uang masuk and Uang keluar to the server type filter (AC-F2-6, BUG-QA-F7-04)", () => {
    const out = new URL(
      activityListUrl({ view: "active", month: "2026-10", filter: "out" }),
      "http://localhost",
    );
    expect(out.searchParams.get("type")).toBe("MONEY_OUT");

    const input = new URL(
      activityListUrl({ view: "active", month: "2026-10", filter: "in" }),
      "http://localhost",
    );
    expect(input.searchParams.get("type")).toBe("MONEY_IN");

    for (const filter of ["all", "transfer"] as const) {
      const url = new URL(
        activityListUrl({ view: "active", month: "2026-10", filter }),
        "http://localhost",
      );
      expect(url.searchParams.has("type")).toBe(false);
    }
  });

  it("keeps the type filter when a later page uses a cursor", () => {
    const secondPage = new URL(
      activityListUrl({ view: "active", month: "2026-10", filter: "out", cursor: "page-2" }),
      "http://localhost",
    );
    expect(secondPage.searchParams.get("type")).toBe("MONEY_OUT");
    expect(secondPage.searchParams.get("cursor")).toBe("page-2");
  });

  it("does not send a type filter to the Trash list", () => {
    const trash = new URL(
      activityListUrl({ view: "trash", month: "2026-10", filter: "out" }),
      "http://localhost",
    );
    expect(trash.searchParams.has("type")).toBe(false);
  });

  it("sends the cursor and wallet filter with the range", () => {
    const url = activityListUrl({
      view: "active",
      month: "2025-03",
      cursor: "abc",
      walletId: "0f0f0f0f-0000-4000-8000-000000000001",
    });
    const params = new URL(url, "http://localhost").searchParams;
    expect(params.get("cursor")).toBe("abc");
    expect(params.get("walletId")).toBe("0f0f0f0f-0000-4000-8000-000000000001");
    expect(params.get("from")).toBe("2025-03-01");
    expect(params.get("to")).toBe("2025-03-31");
  });

  it("does not send date bounds on the Trash list", () => {
    expect(
      activityListUrl({ view: "trash", month: "2025-03", from: "2025-03-10", to: "2025-03-20" }),
    ).toBe("/api/transactions/trash");
  });
});
