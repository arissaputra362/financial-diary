import { describe, expect, it } from "vitest";
import { readInviteCode, readRedirect } from "./auth-params";

describe("readRedirect", () => {
  it("keeps in-app paths, including nested ones", () => {
    expect(readRedirect("/home")).toBe("/home");
    expect(readRedirect("/transactions?month=2026-10")).toBe("/transactions?month=2026-10");
  });

  it("falls back to /transactions for off-site or malformed values", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "javascript:alert(1)",
      "",
      undefined,
      ["/home", "/budget"],
    ]) {
      expect(readRedirect(value)).toBe("/transactions");
    }
  });
});

describe("readInviteCode", () => {
  it("trims and uppercases the code", () => {
    expect(readInviteCode("  abc123 ")).toBe("ABC123");
  });

  it("returns an empty string for missing or repeated params", () => {
    expect(readInviteCode(undefined)).toBe("");
    expect(readInviteCode(["abc", "def"])).toBe("");
  });
});
