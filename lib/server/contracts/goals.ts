import { z } from "zod";
import { hasAtMostTwoDecimals } from "@/lib/money-input";
import { cursorSchema, limitSchema } from "./common";

/*
  Goal contracts (feat-goals-advisor §Validasi Rules, A-16, A-20).
  targetAmountMinor > 0; savedDelta ≠ 0 (delta-based atomic update).
*/

const INT32_MAX = 2_147_483_647;

export const createGoalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama target tidak boleh kosong dan maksimal 80 karakter.")
    .max(80, "Nama target tidak boleh kosong dan maksimal 80 karakter."),
  targetAmountMinor: z
    .number({ message: "Target harus berupa angka." })
    .positive("Target harus lebih dari 0.")
    .max(INT32_MAX, "Target terlalu besar.")
    .refine(hasAtMostTwoDecimals, "Target maksimal dua angka desimal."),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.")
    .optional(),
});

export const adjustSavedSchema = z.object({
  savedDelta: z
    .number({ message: "Jumlah perubahan tidak valid." })
    .refine(hasAtMostTwoDecimals, "Jumlah perubahan maksimal dua angka desimal.")
    .refine((value) => value !== 0, "Jumlah perubahan tidak valid."),
});

export const goalTrashListQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema.optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type AdjustSavedInput = z.infer<typeof adjustSavedSchema>;
