/*
  AdvisorService (AC-F4-5..AC-F4-8, D-16/D-17/D-19, A-11, ADR-003).

  Cache-first per (household, source_period_start, source_period_end) with a
  24 h TTL: a hit returns delivery=CACHE; a miss calls the AdvisorProvider seam,
  re-validates the UNTRUSTED output with Zod, asserts the forbidden-phrase
  blacklist, and only then persists (never a failed insight). Prune-on-create
  keeps ~10 newest insights per household. Failures are typed
  ADVISOR_RATE_LIMITED / ADVISOR_UNAVAILABLE / ADVISOR_INVALID_OUTPUT; when an
  unexpired cache exists for the requested period the service returns it with
  delivery=CACHE instead of an error.

  The model receives period aggregates only (totals in/out, spent vs budget,
  active goals); per-record rows never leave this service (AC-F4-5).
*/

import { computeRequestHash, IdempotencyService } from "./idempotency";
import type { PlanningRepositories } from "../repositories/ledger";
import type { AdvisorInsightRecord } from "../repositories/ledger";
import { advisorInsightOutputSchema } from "../contracts/advisor";
import { AppError, unprocessableCode } from "../errors";
import type { AdvisorAggregate, AdvisorProvider } from "../providers/advisor";
import type { AdvisorInsightDTO, AdvisorInsightResponseDTO } from "@/types/api";
import { endOfJakartaDay, startOfJakartaDay } from "../jakarta";
import { goalProgressPercent } from "./goal";
import type { PlanningTransaction, ServiceResult } from "./types";

const ADVISORS_PATH = "/api/advisor/insights";
const CACHE_TTL_HOURS = 24;
/** Retention: keep ~10 newest insights per household (D-16), prune-on-create. */
const KEEP_INSIGHTS = 10;

/** Phrases the assistant copy must never contain (AC-F4-8, D-19). */
const FORBIDDEN_PHRASES = ["dijamin", "pasti hemat", "sesuai ojk"] as const;

/** The forbidden-phrase assert runs over all model text at the service boundary (AC-F4-8). */
export function hasForbiddenPhrase(values: string[]): boolean {
  const joined = values.join("\n").toLowerCase();
  return FORBIDDEN_PHRASES.some((phrase) => joined.includes(phrase));
}

export type AdvisorActor = { userId: string; householdId: string };

export type AdvisorPeriod = { start: string; end: string };

/** Fails closed as an ADVISOR_INVALID_OUTPUT violation. */
function invalidOutput(reason: string, detail: string): AppError {
  return unprocessableCode("ADVISOR_INVALID_OUTPUT", { period: [`${reason}: ${detail}`] }, "Saran belum bisa dibuat dari model.");
}

function utcMidnight(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function isUnexpired(row: AdvisorInsightRecord, now: Date): boolean {
  return row.expiresAt.getTime() > now.getTime();
}

export class AdvisorService {
  private readonly idempotency: IdempotencyService<PlanningRepositories>;

  constructor(
    private readonly repos: PlanningRepositories,
    private readonly transaction: PlanningTransaction,
    private readonly provider: AdvisorProvider,
  ) {
    this.idempotency = new IdempotencyService<PlanningRepositories>(transaction);
  }

  getInsight(actor: AdvisorActor, period: AdvisorPeriod, idempotencyKey?: string): Promise<ServiceResult> {
    const run = (repos: PlanningRepositories) =>
      this.generate(repos, actor, period);

    if (idempotencyKey) {
      const hash = computeRequestHash("POST", ADVISORS_PATH, { period });
      return this.idempotency.run(actor.userId, idempotencyKey, hash, run);
    }
    return this.transaction(run);
  }

  private async generate(
    repos: PlanningRepositories,
    actor: AdvisorActor,
    period: AdvisorPeriod,
  ): Promise<ServiceResult> {
    const start = utcMidnight(period.start);
    const end = utcMidnight(period.end);
    const now = new Date();

    /* AC-F4-6: cache key is exactly (household, requested period), unexpired. */
    const cached = await repos.advisorInsight.findLatestUnexpired(actor.householdId, start, end);
    if (cached && isUnexpired(cached, now)) {
      return { status: 200, body: { insight: toInsightDTO(cached), delivery: "CACHE" } satisfies AdvisorInsightResponseDTO };
    }

    const aggregate = await this.buildAggregate(repos, actor.householdId, period);

    let generation: Awaited<ReturnType<AdvisorProvider["insight"]>>;
    try {
      generation = await this.provider.insight(aggregate);
    } catch {
      /* Fail-closed: provider crash is a model-unavailable condition. */
      generation = { ok: false, errorCode: "ADVISOR_UNAVAILABLE" };
    }

    if (generation.ok) {
      const parsed = advisorInsightOutputSchema.safeParse(generation.raw);
      if (!parsed.success) {
        return this.failOrFallback(repos, actor.householdId, start, end, now, invalidOutput("format", "Output model tidak sesuai format yang dijanjikan."));
      }

      const output = parsed.data;
      if (output.actions.length === 0) {
        return this.failOrFallback(repos, actor.householdId, start, end, now, invalidOutput("actions", "Tidak ada aksi yang bisa diambil."));
      }
      if (
        hasForbiddenPhrase([
          output.headline,
          output.summary,
          output.limitations,
          ...output.actions.map((action) => action.label),
        ])
      ) {
        return this.failOrFallback(repos, actor.householdId, start, end, now, invalidOutput("blacklist", "Ada kalimat yang tidak boleh dipakai."));
      }

      const generatedAt = new Date();
      const expiresAt = new Date(generatedAt.getTime() + CACHE_TTL_HOURS * 3_600_000);
      /* sourcePeriod is owned by the request, not the model (AC-F4-5). */
      const insight: AdvisorInsightDTO = {
        headline: output.headline,
        summary: output.summary,
        actions: output.actions,
        limitations: output.limitations,
        sourcePeriod: { start: period.start, end: period.end },
        model: generation.model,
        generatedAt: generatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      await repos.advisorInsight.create({
        householdId: actor.householdId,
        requestedByUserId: actor.userId,
        sourcePeriodStart: start,
        sourcePeriodEnd: end,
        model: generation.model,
        headline: insight.headline,
        summary: insight.summary,
        actionsJson: insight.actions,
        limitations: insight.limitations,
        generatedAt,
        expiresAt,
      });
      /* prune-on-create: keep only the newest KEEP_INSIGHTS rows (D-16). */
      await repos.advisorInsight.prune(actor.householdId, KEEP_INSIGHTS);

      return { status: 200, body: { insight, delivery: "FRESH" } satisfies AdvisorInsightResponseDTO };
    }

    /* Failure path (AC-F4-7): typed error; fall back to cache when it appeared. */
    const messages: Record<string, { status: number; message: string }> = {
      ADVISOR_RATE_LIMITED: { status: 429, message: "Sedang ramai. Coba lagi sebentar." },
      ADVISOR_UNAVAILABLE: { status: 503, message: "Saran belum bisa dibuat sekarang. Coba lagi nanti." },
      ADVISOR_INVALID_OUTPUT: { status: 422, message: "Saran belum bisa dibuat dari datamu. Coba lagi." },
    };
    const fallback = messages[generation.errorCode] ?? messages.ADVISOR_UNAVAILABLE;
    return this.failOrFallback(
      repos,
      actor.householdId,
      start,
      end,
      now,
      new AppError({ code: generation.errorCode, message: fallback.message, statusCode: fallback.status }),
    );
  }

  /**
   * AC-F4-7: the failure itself is never cached; if an unexpired cache for the
   * exact requested period exists (even from a concurrent writer), return it
   * with delivery=CACHE, otherwise the typed error wins.
   */
  private async failOrFallback(
    repos: PlanningRepositories,
    householdId: string,
    start: Date,
    end: Date,
    now: Date,
    error: AppError,
  ): Promise<ServiceResult> {
    const cached = await repos.advisorInsight.findLatestUnexpired(householdId, start, end);
    if (cached && isUnexpired(cached, now)) {
      return { status: 200, body: { insight: toInsightDTO(cached), delivery: "CACHE" } satisfies AdvisorInsightResponseDTO };
    }
    throw error;
  }

  /**
   * Period aggregates only (AC-F4-5). Money totals honor the Asia/Jakarta
   * calendar day boundaries; transfer legs never count as spending (the
   * repository already excludes them).
   */
  private async buildAggregate(
    repos: PlanningRepositories,
    householdId: string,
    period: AdvisorPeriod,
  ): Promise<AdvisorAggregate> {
    const from = startOfJakartaDay(period.start);
    const to = endOfJakartaDay(period.end);
    const monthFirst = `${period.start.slice(0, 7)}-01`;
    const monthFirstUtc = utcMidnight(monthFirst);
    const [totalIn, totalOut, budgetRow, goalRows] = await Promise.all([
      repos.transaction.sumByType(householdId, { type: "MONEY_IN", from, to }, { walletScope: "SHARING" }),
      repos.transaction.sumByType(householdId, { type: "MONEY_OUT", from, to }, { walletScope: "SHARING" }),
      repos.budget.findByPeriod(householdId, monthFirstUtc),
      repos.goal.listActive(householdId),
    ]);

    /*
      The budget is a monthly number, so it is only sent when the budget month
      actually lies inside the requested period; otherwise null (never a
      misleading per-month compare outside its own month).
    */
    let budgetMinor: number | null = null;
    if (budgetRow && period.start <= monthFirst && monthFirst <= period.end) {
      budgetMinor = budgetRow.amountMinor;
    }

    const activeGoals = goalRows.map((goal) => ({
      name: goal.name,
      progressPercent: goalProgressPercent(goal.savedAmountMinor, goal.targetAmountMinor),
    }));

    return {
      period,
      totalInMinor: totalIn,
      totalOutMinor: totalOut,
      budgetMinor,
      activeGoals,
    } satisfies AdvisorAggregate;
  }
}

function toInsightDTO(row: AdvisorInsightRecord): AdvisorInsightDTO {
  const actions = advisorInsightOutputSchema.shape.actions.parse(row.actionsJson);
  return {
    headline: row.headline,
    summary: row.summary,
    actions,
    limitations: row.limitations,
    sourcePeriod: {
      start: row.sourcePeriodStart.toISOString().slice(0, 10),
      end: row.sourcePeriodEnd.toISOString().slice(0, 10),
    },
    model: row.model,
    generatedAt: row.generatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}