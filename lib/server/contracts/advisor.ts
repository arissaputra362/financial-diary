import { z } from "zod";
import { ADVISOR_ERROR_CODES } from "./common";

/*
  Advisor contracts (feat-goals-advisor §Validasi Rules, ADR-003).
  Period is a calendar range in Asia/Jakarta (A-13), span ≤ 90 days.
*/

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");

const DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 90;

export const advisorInsightRequestSchema = z
  .object({
    period: z.object({
      start: dateOnlySchema,
      end: dateOnlySchema,
    }),
  })
  .superRefine((value, ctx) => {
    const start = new Date(`${value.period.start}T00:00:00Z`);
    const end = new Date(`${value.period.end}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      ctx.addIssue({ code: "custom", path: ["period"], message: "Rentang tanggal tidak valid." });
      return;
    }
    if (start > end) {
      ctx.addIssue({ code: "custom", path: ["period", "start"], message: "Rentang tanggal tidak valid." });
      return;
    }
    const spanDays = (end.getTime() - start.getTime()) / DAY_MS + 1;
    if (spanDays > MAX_SPAN_DAYS) {
      ctx.addIssue({ code: "custom", path: ["period", "end"], message: "Rentang tanggal tidak valid." });
    }
  });

/** Structured advisor output the model must produce (arch-dec "Advisor insight"). */
export const advisorInsightOutputSchema = z.object({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  actions: z.array(
    z.object({
      label: z.string().min(1).max(80),
      type: z.enum(["VIEW_GOAL", "REVIEW_SPENDING", "NONE"]),
    }),
  ),
  limitations: z.string().min(1).max(300),
  sourcePeriod: z.object({
    start: dateOnlySchema,
    end: dateOnlySchema,
  }),
});

export const advisorErrorCodeSchema = z.enum(ADVISOR_ERROR_CODES);

export { ADVISOR_ERROR_CODES };
export type { AdvisorErrorCode } from "./common";

export type AdvisorInsightRequest = z.infer<typeof advisorInsightRequestSchema>;
export type AdvisorInsightOutput = z.infer<typeof advisorInsightOutputSchema>;