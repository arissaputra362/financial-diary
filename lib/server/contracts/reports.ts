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

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");

export const monthlyReportQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Bulan tidak valid.")
    .optional(),
  /* An explicit range (rolling window or custom) overrides the month. */
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  scope: z.enum(["all", "shared", "personal"]).optional(),
  walletId: z.string().uuid("Dompet tidak valid.").optional(),
  walletIds: z.array(z.string().uuid("Dompet tidak valid.")).max(50).optional(),
}).refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { message: "Rentang tanggal tidak valid.", path: ["to"] },
);

/*
  Activity summary accepts the same period as the list: a calendar month or an
  explicit inclusive range (rolling 7/30 days or a custom range). The range
  takes precedence when both boundaries are present.
*/
export const activityWalletSummaryQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Bulan tidak valid.")
    .optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  scope: z.enum(["all", "shared", "personal"]).default("all"),
  walletIds: z.array(z.string().uuid("Dompet tidak valid.")).max(50).default([]),
}).refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { message: "Rentang tanggal tidak valid.", path: ["to"] },
).refine(
  (value) => Boolean(value.month) || Boolean(value.from && value.to),
  { message: "Pilih bulan atau rentang tanggal.", path: ["month"] },
);

export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;
export type ActivityWalletSummaryQuery = z.infer<typeof activityWalletSummaryQuerySchema>;
