import { describe, expect, it } from "vitest";
import {
  listInstitutionsQuerySchema,
  quickAddInstitutionSchema,
  walletInstitutionSchema,
} from "./institutions";
import { createWalletSchema, updateWalletSchema } from "./wallets";

const ID = "11111111-1111-4111-8111-111111111111";

describe("institution contracts (T-011 / A-57)", () => {
  it("trims the Quick Add name, enforces 1..80, and rejects unknown fields", () => {
    expect(quickAddInstitutionSchema.parse({ name: "  Bank Pasar  " }).name).toBe("Bank Pasar");
    expect(quickAddInstitutionSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(quickAddInstitutionSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
    expect(
      quickAddInstitutionSchema.safeParse({ name: "Bank", category: "SYARIAH" }).success,
    ).toBe(false);
  });

  it("validates the list query length", () => {
    expect(listInstitutionsQuerySchema.safeParse({ q: "bca" }).success).toBe(true);
    expect(listInstitutionsQuerySchema.safeParse({ q: "x".repeat(81) }).success).toBe(false);
  });

  it("accepts exactly one discriminated institution reference", () => {
    expect(walletInstitutionSchema.parse({ kind: "OFFICIAL", id: ID })).toEqual({
      kind: "OFFICIAL",
      id: ID,
    });
    expect(walletInstitutionSchema.parse({ kind: "CUSTOM", id: ID })).toEqual({
      kind: "CUSTOM",
      id: ID,
    });
    expect(walletInstitutionSchema.parse({ kind: "NONE" })).toEqual({ kind: "NONE" });
  });

  it("rejects two references, a missing id, and unknown keys", () => {
    expect(
      walletInstitutionSchema.safeParse({ kind: "OFFICIAL", id: ID, customId: ID }).success,
    ).toBe(false);
    expect(walletInstitutionSchema.safeParse({ kind: "OFFICIAL" }).success).toBe(false);
    expect(walletInstitutionSchema.safeParse({ kind: "OTHER", id: ID }).success).toBe(false);
    expect(
      walletInstitutionSchema.safeParse({ kind: "NONE", officialInstitutionId: ID }).success,
    ).toBe(false);
  });

  it("keeps wallet create/update backward-compatible when institution is omitted", () => {
    expect(createWalletSchema.parse({ name: "Kas" })).toMatchObject({ name: "Kas", scope: "PERSONAL" });
    expect(updateWalletSchema.parse({ name: "Kas" })).toEqual({ name: "Kas" });
  });

  it("accepts institution on create/update and still rejects a scope change", () => {
    expect(
      createWalletSchema.parse({ name: "Kas", institution: { kind: "OFFICIAL", id: ID } }).institution,
    ).toEqual({ kind: "OFFICIAL", id: ID });
    expect(
      updateWalletSchema.parse({ institution: { kind: "NONE" } }).institution,
    ).toEqual({ kind: "NONE" });
    expect(updateWalletSchema.safeParse({ scope: "SHARING" }).success).toBe(false);
  });
});
