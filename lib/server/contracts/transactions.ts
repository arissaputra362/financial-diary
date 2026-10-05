import { z } from "zod";
import { cursorSchema, limitSchema } from "./common";

/*
  Transaction contracts (feat-transactions-ocr §Validasi Rules, A-09, A-12, A-13,
  A-14, A-20). Money is integer minor units, IDR scale 0 (A-05).
*/

export const TRANSACTION_TYPES = ["MONEY_IN", "MONEY_OUT", "TRANSFER"] as const;
export const TRANSACTION_SOURCES = ["MANUAL", "OCR"] as const;

/** Canonical categories (A-09 / D-11). */
export const CATEGORIES = [
  "food",
  "transport",
  "bills",
  "shopping",
  "health",
  "education",
  "entertainment",
  "income",
  "gift_donation",
  "other",
] as const;

/** MONEY_OUT accepts every category except `income`; MONEY_IN only income/gift/other. */
const MONEY_OUT_CATEGORIES = CATEGORIES.filter((c) => c !== "income");
const MONEY_IN_CATEGORIES = ["income", "gift_donation", "other"] as const;

const INT32_MAX = 2_147_483_647;

/** Date-only string (YYYY-MM-DD); converted to 12:00 Asia/Jakarta by the service (A-12). */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");

export const createTransactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES, { message: "Pilih jenis transaksi." }),
    amountMinor: z
      .number({ message: "Jumlah harus berupa angka." })
      .int("Jumlah harus berupa bilangan bulat.")
      .positive("Jumlah harus lebih dari 0.")
      .max(INT32_MAX, "Jumlah terlalu besar."),
    category: z.enum(CATEGORIES, { message: "Pilih kategori yang sesuai." }),
    occurredAt: dateOnlySchema,
    merchant: z.string().trim().max(120, "Nama toko maksimal 120 karakter.").optional(),
    note: z.string().trim().max(500, "Catatan maksimal 500 karakter.").optional(),
    source: z.enum(TRANSACTION_SOURCES).default("MANUAL"),
    receiptId: z.string().uuid("Data tidak ditemukan.").optional(),
  })
  .superRefine((value, ctx) => {
    const allowed = value.type === "MONEY_IN" ? MONEY_IN_CATEGORIES : MONEY_OUT_CATEGORIES;
    if (!(allowed as readonly string[]).includes(value.category)) {
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Pilih kategori yang sesuai.",
      });
    }
  });

export const listTransactionsQuerySchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  source: z.enum(TRANSACTION_SOURCES).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  cursor: cursorSchema.optional(),
  limit: limitSchema.optional(),
});

/** Path parameter for single-record routes (trash/restore). */
export const idSchema = z.string().uuid("Data tidak ditemukan.");

export const trashListQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema.optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type TrashListQuery = z.infer<typeof trashListQuerySchema>;