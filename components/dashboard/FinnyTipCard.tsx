import Link from "next/link";
import { ChevronRight, Sprout } from "lucide-react";
import { FinnyMascot } from "@/components/brand/FinnyMascot";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthlyBudgetDTO } from "@/types/api";

type BudgetState = "unset" | "safe" | "warning" | "over";

const STATE_COPY: Record<BudgetState, { label: string; tone: string; bar: string }> = {
  unset: { label: "Belum diatur", tone: "text-ink-3", bar: "bg-ink-3" },
  safe: { label: "Aman", tone: "text-green", bar: "bg-green" },
  warning: { label: "Hampir habis", tone: "text-warning", bar: "bg-warning" },
  over: { label: "Lewat budget", tone: "text-danger", bar: "bg-danger" },
};

function summarize(budget: MonthlyBudgetDTO) {
  const isSet = budget.isSet && budget.budgetMinor !== null && budget.budgetMinor > 0;
  const percent = isSet
    ? Math.min(100, Math.round((budget.spentMinor / (budget.budgetMinor ?? 1)) * 100))
    : 0;
  const remaining = budget.remainingMinor ?? 0;
  const over = isSet && remaining < 0;
  const warning = isSet && !over && percent >= 80;
  const state: BudgetState = !isSet ? "unset" : over ? "over" : warning ? "warning" : "safe";
  return { isSet, percent, remaining, state };
}

function BudgetRow({ label, budget }: { label: string; budget: MonthlyBudgetDTO }) {
  const summary = summarize(budget);
  const copy = STATE_COPY[summary.state];
  return (
    <div className="rounded-2xl bg-card/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-green">{label}</p>
        <span className={cn("text-[11px] font-semibold", copy.tone)}>{copy.label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-ink">
        {summary.isSet
          ? summary.state === "over"
            ? `Lewat ${formatIDR(Math.abs(summary.remaining))}`
            : `Sisa ${formatIDR(summary.remaining)}`
          : "Belum diatur"}
      </p>
      <p className="text-[11px] text-ink-3">
        {summary.isSet
          ? `dari ${formatIDR(budget.budgetMinor ?? 0)}`
          : "Atur di halaman Budget"}
      </p>
      {summary.isSet ? (
        <div
          role="img"
          aria-label={`${summary.percent} persen budget ${label.toLowerCase()} terpakai`}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-bar-track"
        >
          <div
            className={cn("h-full rounded-full", copy.bar)}
            style={{ width: `${summary.percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Finny reports both budgets at once. Shared and personal are separate rows and
 * are never added together (A-44); there is no "Semua" total for budgets.
 */
export function FinnyTipCard({
  sharedBudget,
  personalBudget,
}: {
  sharedBudget: MonthlyBudgetDTO;
  personalBudget: MonthlyBudgetDTO;
}) {
  const bothUnset = !summarize(sharedBudget).isSet && !summarize(personalBudget).isSet;

  return (
    <section
      aria-labelledby="finny-tip-title"
      className="relative flex h-full flex-col overflow-hidden rounded-feature border border-success-border bg-mint p-4 shadow-bento sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-green">
            <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
            Finny
            <span className="font-medium normal-case tracking-normal text-ink-3">Budget</span>
          </p>
          <h2 id="finny-tip-title" className="mt-1 text-base font-semibold leading-snug text-ink">
            Status budget
          </h2>
        </div>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-card/60">
          <FinnyMascot className="h-14 w-14" />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <BudgetRow label="Bersama" budget={sharedBudget} />
        <BudgetRow label="Pribadi" budget={personalBudget} />
      </div>

      <Link
        href="/budget"
        className="mt-auto inline-flex min-h-11 items-center gap-1 rounded-xl pt-3 text-sm font-semibold text-green hover:text-green-hover"
      >
        {bothUnset ? "Atur budget" : "Lihat budget"}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
