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
