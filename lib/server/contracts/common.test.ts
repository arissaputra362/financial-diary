import { describe, expect, it } from "vitest";
import {
  cursorSchema,
  limitSchema,
  idempotencyKeyHeaderSchema,
  errorEnvelopeSchema,
  validationErrorEnvelope,
  formatFieldErrors,
  ERROR_CODES,
} from "./common";
import { signupSchema } from "./auth";

describe("cursorSchema (A-14)", () => {
  it("accepts base64 opaque cursors", () => {
    expect(cursorSchema.parse("b2NjdXJyZWRfYXQ6MTIz")).toBe("b2NjdXJyZWRfYXQ6MTIz");
  });

  it("rejects cursors with spaces or separators", () => {
    expect(cursorSchema.safeParse("not a cursor").success).toBe(false);
    expect(cursorSchema.safeParse("").success).toBe(false);
  });
});

describe("limitSchema (A-14)", () => {
  it("coerces strings and defaults to 20", () => {
    expect(limitSchema.parse("50")).toBe(50);
    expect(limitSchema.parse(undefined)).toBe(20);
  });

  it("rejects above 50 and below 1 with explicit messages", () => {
    expect(limitSchema.safeParse(51).success).toBe(false);
    expect(limitSchema.safeParse(0).success).toBe(false);
  });
});

describe("idempotencyKeyHeaderSchema (A-22)", () => {
  it("accepts an opaque key of reasonable length", () => {
    expect(idempotencyKeyHeaderSchema.parse("key-1234-abcd").length).toBeGreaterThan(0);
  });

  it("rejects keys shorter than 8 characters", () => {
    expect(idempotencyKeyHeaderSchema.safeParse("short").success).toBe(false);
  });
});

describe("error envelope", () => {
  it("matches the canonical API error shape", () => {
    const envelope = {
      error: {
        code: "VALIDATION_FAILED",
        message: "Data yang dikirim tidak valid.",
        fieldErrors: { password: ["Kata sandi minimal 8 karakter."] },
      },
    };
    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("maps a ZodError to explicit fieldErrors, not a generic 500", () => {
    const result = signupSchema.safeParse({
      email: "budi@example.com",
      displayName: "Budi",
      password: "pendek",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const envelope = validationErrorEnvelope(result.error);
      expect(envelope.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(envelope.error.fieldErrors?.password).toEqual(["Kata sandi minimal 8 karakter."]);
    }
  });

  it("groups multiple issues per field", () => {
    const fieldErrors = formatFieldErrors({
      issues: [
        { path: ["note"], message: "Catatan maksimal 500 karakter." },
        { path: ["note"], message: "Catatan tidak valid." },
      ],
    } as never);
    expect(fieldErrors.note).toHaveLength(2);
  });
});