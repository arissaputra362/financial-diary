import { z } from "zod";
import { idempotencyKeyHeaderSchema, OCR_ERROR_CODES } from "./common";

/*
  OCR contracts (feat-transactions-ocr, A-02, A-10, A-11, A-21).
  Upload limit is exactly 4.194.304 byte (4MB, A-02). Failure keeps HTTP 200 with
  a FAILED job + errorCode from the OCR namespace (A-10).
*/

/** 4MB = 4 * 1024 * 1024 (A-02). */
export const MAX_RECEIPT_BYTES = 4_194_304;

/** Mime allowlist (A-21). */
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Low-confidence threshold (A-21). */
export const OCR_CONFIDENCE_THRESHOLD = 0.7;

export const ocrUploadMetaSchema = z.object({
  mimeType: z
    .string()
    .refine((value) => (RECEIPT_MIME_TYPES as readonly string[]).includes(value), {
      message: "Format foto harus JPG, PNG, atau WebP.",
    }),
  sizeBytes: z
    .number({ message: "Ukuran foto tidak valid." })
    .int("Ukuran foto tidak valid.")
    .positive("Ukuran foto tidak valid.")
    .max(MAX_RECEIPT_BYTES, "Ukuran foto maksimal 4 MB."),
  idempotencyKey: idempotencyKeyHeaderSchema.optional(),
});

/** Editable draft fields the model must produce (arch-dec "OCR draft"). */
export const ocrDraftSchema = z.object({
  merchant: z.string().max(120).nullable(),
  totalAmountMinor: z
    .number()
    .int()
    .positive("Jumlah harus lebih dari 0.")
    .max(2_147_483_647, "Jumlah terlalu besar.")
    .nullable(),
  currencyCode: z.enum(["IDR"]).nullable(),
  occurredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.")
    .nullable(),
  category: z.string().nullable(),
  taxAmountMinor: z
    .number()
    .int()
    .min(0, "Pajak tidak boleh negatif.")
    .max(2_147_483_647, "Pajak terlalu besar.")
    .nullable(),
  confidence: z.number().min(0, "Confidence harus 0 sampai 1.").max(1, "Confidence harus 0 sampai 1."),
  missingFields: z.array(z.enum(["merchant", "totalAmountMinor", "occurredAt", "category"])),
  notes: z.string().max(500).nullable(),
});

export const ocrJobParamsSchema = z.object({
  id: z.string().uuid("Data tidak ditemukan."),
});

export const ocrJobStatusSchema = z.enum(["PROCESSING", "SUCCEEDED", "FAILED"]);

export const ocrErrorCodeSchema = z.enum(OCR_ERROR_CODES);

export { OCR_ERROR_CODES };
export type { OcrErrorCode } from "./common";

export type OcrUploadMeta = z.infer<typeof ocrUploadMetaSchema>;
export type OcrDraft = z.infer<typeof ocrDraftSchema>;
export type OcrJobStatus = z.infer<typeof ocrJobStatusSchema>;