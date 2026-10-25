import { z } from "zod";

/*
  Monthly report query contract (feat-reporting). Wire values are lowercase for
  scope, matching /api/budget; the service maps them to SHARED/PERSONAL. `month`
  is optional so a fresh request can default to the current Jakarta month.
*/

export const reportScopeSchema = z.enum(["shared", "personal"], {
  message: "Cakupan laporan tidak dikenal.",
});
export type ReportScopeKey = z.infer<typeof reportScopeSchema>;

export const monthlyReportQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Bulan tidak valid.")
    .optional(),
  scope: reportScopeSchema.optional(),
  walletId: z.string().uuid("Dompet tidak valid.").optional(),
});

export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;
