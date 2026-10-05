import { describe, expect, it } from "vitest";
import {
  ocrUploadMetaSchema,
  ocrDraftSchema,
  ocrJobParamsSchema,
  ocrErrorCodeSchema,
  MAX_RECEIPT_BYTES,
  OCR_ERROR_CODES,
} from "./ocr";

describe("ocrUploadMetaSchema", () => {
  it("accepts an allowed mime within the 4MB limit (A-02, A-21)", () => {
    const result = ocrUploadMetaSchema.parse({
      mimeType: "image/jpeg",
      sizeBytes: MAX_RECEIPT_BYTES,
    });
    expect(result.sizeBytes).toBe(4_194_304);
  });

  it("rejects a file above 4.194.304 byte with an explicit message (A-02)", () => {
    const result = ocrUploadMetaSchema.safeParse({
      mimeType: "image/jpeg",
      sizeBytes: MAX_RECEIPT_BYTES + 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Ukuran foto maksimal 4 MB.");
    }
  });

  it("rejects a disallowed mime with an explicit message (A-21)", () => {
    const result = ocrUploadMetaSchema.safeParse({
      mimeType: "image/gif",
      sizeBytes: 1000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Format foto harus JPG, PNG, atau WebP.");
    }
  });
});

describe("ocrDraftSchema", () => {
  const validDraft = {
    merchant: "Toko Sinar",
    totalAmountMinor: 15_000,
    currencyCode: "IDR",
    occurredAt: "2026-10-01",
    category: "food",
    taxAmountMinor: 1_000,
    confidence: 0.92,
    missingFields: [],
    notes: null,
  };

  it("accepts a complete draft", () => {
    expect(ocrDraftSchema.parse(validDraft).confidence).toBe(0.92);
  });

  it("rejects negative amounts", () => {
    const result = ocrDraftSchema.safeParse({ ...validDraft, totalAmountMinor: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside 0..1", () => {
    expect(ocrDraftSchema.safeParse({ ...validDraft, confidence: 1.5 }).success).toBe(false);
    expect(ocrDraftSchema.safeParse({ ...validDraft, confidence: -0.1 }).success).toBe(false);
  });

  it("rejects unsupported currencies", () => {
    const result = ocrDraftSchema.safeParse({ ...validDraft, currencyCode: "USD" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid dates", () => {
    const result = ocrDraftSchema.safeParse({ ...validDraft, occurredAt: "2026/10/01" });
    expect(result.success).toBe(false);
  });
});

describe("ocrJobParamsSchema", () => {
  it("rejects a non-uuid job id", () => {
    expect(ocrJobParamsSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});

describe("OCR error namespace (A-10)", () => {
  it("exposes exactly the four canonical codes", () => {
    expect(Array.from(OCR_ERROR_CODES)).toEqual([
      "OCR_TIMEOUT",
      "OCR_RATE_LIMITED",
      "OCR_INVALID_OUTPUT",
      "OCR_MODEL_UNAVAILABLE",
    ]);
    for (const code of OCR_ERROR_CODES) {
      expect(ocrErrorCodeSchema.parse(code)).toBe(code);
    }
  });

  it("rejects codes outside the namespace", () => {
    expect(ocrErrorCodeSchema.safeParse("OCR_BROKEN").success).toBe(false);
  });
});