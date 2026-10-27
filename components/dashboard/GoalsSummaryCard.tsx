import Link from "next/link";
import { Target } from "lucide-react";
import { formatDateLabel } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import type { GoalSummaryDTO } from "@/types/api";

export interface GoalsSummaryCardProps {
  goals: GoalSummaryDTO[];
}

/**
 * Active savings goals (AC-F2-9; design 02 §5 card 6). Deleted goals never
 * arrive here (the repository filters them) and `progressPercent` is already
 * capped at the DTO boundary, so the client only renders. Empty -> CTA to the
 * budget page where the existing goal form lives.
 */
export function GoalsSummaryCard({ goals }: GoalsSummaryCardProps) {
  return (
    <section
      aria-labelledby="goals-title"
      className="rounded-3xl border border-success-border bg-mint p-6 shadow-bento"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="goals-title"
          className="flex items-center gap-2 text-lg font-semibold text-ink"
        >
          <Target className="h-5 w-5 text-green" aria-hidden="true" />
          Target tabungan
        </h2>
        <span className="shrink-0 rounded-full bg-card/75 px-3 py-1 text-xs font-semibold text-ink-2">
          {goals.length} aktif
        </span>
      </div>

      {goals.length === 0 ? (
        <>
          <p className="mt-4 text-lg font-bold text-ink">Belum ada target tabungan</p>
          <p className="mt-1 text-sm text-ink-2">
            Tentukan target, misal dana darurat atau liburan keluarga.
          </p>
          <Link
            href="/budget"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand-green px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-green-hover"
          >
            Buka halaman target
          </Link>
        </>
      ) : (
        <ul className="mt-5 space-y-5">
          {goals.map((goal) => (
            <li key={goal.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-bold leading-snug text-ink">{goal.name}</p>
                <span className="shrink-0 text-sm font-bold tabular-nums text-green">
                  {goal.progressPercent}%
                </span>
              </div>
              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-bar-track"
                role="img"
                aria-label={`${goal.name} ${goal.progressPercent} persen`}
              >
                <div
                  className="h-full rounded-full bg-green transition-all duration-500"
                  style={{ width: `${goal.progressPercent}%` }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs font-semibold text-ink-2">
                <span className="whitespace-nowrap tabular-nums">
                  Terkumpul {formatIDR(goal.savedAmountMinor)}
                </span>
                <span className="whitespace-nowrap font-normal tabular-nums text-ink-2">
                  dari {formatIDR(goal.targetAmountMinor)}
                  {goal.deadline ? ` · ${formatDateLabel(goal.deadline)}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
