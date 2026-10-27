import { z } from "zod";
import { hasAtMostTwoDecimals } from "@/lib/money-input";
import { cursorSchema, limitSchema } from "./common";

/*
  Transaction contracts (feat-transactions-ocr §Validasi Rules, A-09, A-12, A-13,
  A-14, A-20). Money is integer minor units, IDR scale 0 (A-05).
*/

/** Accepted create inputs. `TRANSFER` is translated to two stored legs (AC-F3-3). */
export const TRANSACTION_TYPES = ["MONEY_IN", "MONEY_OUT", "TRANSFER"] as const;
/** Types a row can actually be persisted as; used for read filters. */
export const STORED_TRANSACTION_TYPES = ["MONEY_IN", "MONEY_OUT"] as const;
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
export const MONEY_OUT_CATEGORIES = CATEGORIES.filter((c) => c !== "income");
export const MONEY_IN_CATEGORIES = ["income", "gift_donation", "other"] as const;

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
      .positive("Jumlah harus lebih dari 0.")
      .max(INT32_MAX, "Jumlah terlalu besar.")
      .refine(hasAtMostTwoDecimals, "Jumlah maksimal dua angka desimal."),
    /*
      Required for money in/out (enforced in superRefine). TRANSFER does not use
      a category (design 03 §2.2); the service stores null on both legs.
    */
    category: z.enum(CATEGORIES, { message: "Pilih kategori yang sesuai." }).optional(),
    occurredAt: dateOnlySchema,
    merchant: z.string().trim().max(120, "Nama toko maksimal 120 karakter.").optional(),
    note: z.string().trim().max(500, "Catatan maksimal 500 karakter.").optional(),
    source: z.enum(TRANSACTION_SOURCES).default("MANUAL"),
    receiptId: z.string().uuid("Data tidak ditemukan.").optional(),
    /* Wallet binding (A-40): MONEY_IN/OUT require walletId; TRANSFER requires both ids. */
    walletId: z.string().uuid("Pilih dompet.").optional(),
    fromWalletId: z.string().uuid("Pilih dompet asal.").optional(),
    toWalletId: z.string().uuid("Pilih dompet tujuan.").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "TRANSFER") {
      const allowed = value.type === "MONEY_IN" ? MONEY_IN_CATEGORIES : MONEY_OUT_CATEGORIES;
      if (value.category === undefined || !(allowed as readonly string[]).includes(value.category)) {
        ctx.addIssue({
          code: "custom",
          path: ["category"],
          message: "Pilih kategori yang sesuai.",
        });
      }
      if (value.walletId === undefined) {
        ctx.addIssue({ code: "custom", path: ["walletId"], message: "Pilih dompet." });
      }
    } else {
      if (value.fromWalletId === undefined) {
        ctx.addIssue({ code: "custom", path: ["fromWalletId"], message: "Pilih dompet asal." });
      }
      if (value.toWalletId === undefined) {
        ctx.addIssue({ code: "custom", path: ["toWalletId"], message: "Pilih dompet tujuan." });
      }
      if (
        value.fromWalletId !== undefined &&
        value.toWalletId !== undefined &&
        value.fromWalletId === value.toWalletId
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["toWalletId"],
          message: "Dompet asal dan tujuan harus berbeda.",
        });
      }
    }
    if (value.source === "OCR" && value.receiptId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["receiptId"],
        message: "Struk tidak ditemukan.",
      });
    }
  });

/** Update fields for one active, non-transfer transaction (AC-F3-15). */
export const updateTransactionSchema = z
  .object({
    type: z.enum(STORED_TRANSACTION_TYPES, { message: "Pilih jenis transaksi." }),
    amountMinor: z
      .number({ message: "Jumlah harus berupa angka." })
      .positive("Jumlah harus lebih dari 0.")
      .max(INT32_MAX, "Jumlah terlalu besar.")
      .refine(hasAtMostTwoDecimals, "Jumlah maksimal dua angka desimal."),
    category: z.enum(CATEGORIES, { message: "Pilih kategori yang sesuai." }),
    occurredAt: dateOnlySchema,
    merchant: z.string().trim().max(120, "Nama toko maksimal 120 karakter.").optional(),
    note: z.string().trim().max(500, "Catatan maksimal 500 karakter.").optional(),
    walletId: z.string().uuid("Pilih dompet."),
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
  type: z.enum(STORED_TRANSACTION_TYPES).optional(),
  source: z.enum(TRANSACTION_SOURCES).optional(),
  walletId: z.string().uuid("Data tidak ditemukan.").optional(),
  scope: z.enum(["PERSONAL", "SHARING"]).optional(),
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
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
/** Pre-parse request shape: `source` and `receiptId` may be absent. */
export type CreateTransactionRequest = z.input<typeof createTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type TrashListQuery = z.infer<typeof trashListQuerySchema>;
