import { describe, expect, it } from "vitest";
import { createWalletSchema, updateWalletSchema } from "./wallets";

describe("wallet contracts (AC-F6-1, C-31)", () => {
  it("defaults scope to Pribadi and treats a blank opening balance as optional (C-16/C-5)", () => {
    const parsed = createWalletSchema.parse({ name: "  Kas Harian  " });
    expect(parsed.name).toBe("Kas Harian");
    expect(parsed.scope).toBe("PERSONAL");
    expect(parsed.openingBalanceMinor).toBeUndefined();
  });

  it("rejects a blank name and a name over 80 characters", () => {
    expect(createWalletSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createWalletSchema.safeParse({ name: "a".repeat(81) }).success).toBe(false);
  });

  it("rejects a negative or non-integer opening balance (AC-F6-1)", () => {
    expect(createWalletSchema.safeParse({ name: "Kas", openingBalanceMinor: -1 }).success).toBe(false);
    expect(createWalletSchema.safeParse({ name: "Kas", openingBalanceMinor: 1.5 }).success).toBe(false);
  });

  it("rejects a purpose over 80 characters", () => {
    expect(createWalletSchema.safeParse({ name: "Kas", purpose: "a".repeat(81) }).success).toBe(false);
  });

  it("update schema never declares scope and rejects it as an unrecognized key (C-31)", () => {
    const result = updateWalletSchema.safeParse({ name: "Baru", scope: "SHARING" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) => entry.code === "unrecognized_keys");
      expect(issue).toBeDefined();
      if (issue && issue.code === "unrecognized_keys") {
        expect(issue.keys).toContain("scope");
      }
    }
  });

  it("update schema accepts name/purpose/opening only", () => {
    expect(updateWalletSchema.safeParse({ name: "Baru", purpose: null, openingBalanceMinor: 1000 }).success).toBe(true);
  });
});
