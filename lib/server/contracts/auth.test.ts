import { describe, expect, it } from "vitest";
import { signupSchema, loginSchema, decisionSchema } from "./auth";

describe("signupSchema", () => {
  it("accepts a valid payload and normalizes email to lowercase", () => {
    const result = signupSchema.parse({
      email: "  Family.Owner@Example.COM ",
      displayName: " Budi ",
      password: "sandirahasia",
    });
    expect(result.email).toBe("family.owner@example.com");
    expect(result.displayName).toBe("Budi");
  });

  it("rejects an invalid email with an explicit message", () => {
    const result = signupSchema.safeParse({
      email: "bukan-email",
      displayName: "Budi",
      password: "sandirahasia",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Masukkan alamat email yang benar.");
    }
  });

  it("rejects a password shorter than 8 with an explicit message", () => {
    const result = signupSchema.safeParse({
      email: "budi@example.com",
      displayName: "Budi",
      password: "pendek",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Kata sandi minimal 8 karakter.");
    }
  });

  it("rejects a displayName longer than 60 characters (A-20)", () => {
    const result = signupSchema.safeParse({
      email: "budi@example.com",
      displayName: "a".repeat(61),
      password: "sandirahasia",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid payload", () => {
    const result = loginSchema.parse({ email: "budi@example.com", password: "sandirahasia" });
    expect(result.email).toBe("budi@example.com");
  });

  describe("signupSchema displayName", () => {
    it("preserves spaces between words while trimming outer whitespace", () => {
      expect(
        signupSchema.parse({
          email: "budi@example.com",
          displayName: "  Budi Santoso  ",
          password: "sandirahasia",
        }).displayName,
      ).toBe("Budi Santoso");
    });
  });

  it("rejects a payload without password", () => {
    const result = loginSchema.safeParse({ email: "budi@example.com" });
    expect(result.success).toBe(false);
  });
});

describe("decisionSchema", () => {
  it("accepts an optional reason up to 200 characters", () => {
    expect(decisionSchema.parse({ reason: "Selamat bergabung" }).reason).toBe("Selamat bergabung");
    expect(decisionSchema.parse({}).reason).toBeUndefined();
  });

  it("rejects a reason longer than 200 characters (A-20)", () => {
    const result = decisionSchema.safeParse({ reason: "a".repeat(201) });
    expect(result.success).toBe(false);
  });
});