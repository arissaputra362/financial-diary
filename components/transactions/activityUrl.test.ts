import { describe, expect, it } from "vitest";
import { activityHref } from "./activityUrl";

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
});
