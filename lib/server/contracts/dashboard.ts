import { z } from "zod";
import { hasAtMostTwoDecimals } from "@/lib/money-input";

/*
  Dashboard + budget contracts (feat-dashboard §Validasi Rules, AC-F2-2, AC-F2-3,
  AC-F2-5, AC-F2-2c). Money is integer minor units, IDR scale 0. `period` maps
  the chart tabs to a number of Asia/Jakarta calendar days (7D / 30D / 90D).
  `scope` selects the independent Pribadi/Bersama budget; absent defaults to
  `shared` so existing consumers are unchanged.
*/

export const DASHBOARD_PERIODS = { "7D": 7, "30D": 30, "90D": 90 } as const;
export type DashboardPeriodKey = keyof typeof DASHBOARD_PERIODS;

export const dashboardQuerySchema = z.object({
  period: z.enum(["7D", "30D", "90D"], { message: "Periode grafik tidak dikenal." }).optional(),
});

/** Wire values are lowercase; the service maps them to PERSONAL / SHARED. */
export const budgetScopeSchema = z.enum(["shared", "personal"], {
  message: "Scope budget tidak dikenal.",
});
export type BudgetScopeKey = z.infer<typeof budgetScopeSchema>;

export const budgetQuerySchema = z.object({
  scope: budgetScopeSchema.optional(),
});

const INT32_MAX = 2_147_483_647;

/** PUT /api/budget body (AC-F2-3, AC-F2-2c): integer, > 0, fits the int32 column. */
export const budgetUpsertSchema = z.object({
  amountMinor: z
    .number({ message: "Budget harus berupa angka." })
    .positive("Budget harus lebih dari 0.")
    .max(INT32_MAX, "Budget terlalu besar.")
    .refine(hasAtMostTwoDecimals, "Budget maksimal dua angka desimal."),
  scope: budgetScopeSchema.optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type BudgetQuery = z.infer<typeof budgetQuerySchema>;
export type BudgetUpsertInput = z.infer<typeof budgetUpsertSchema>;
