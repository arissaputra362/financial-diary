"use client";

import { useState } from "react";
import Link from "next/link";
import { formatIDR } from "@/lib/format";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { MonthlyBudgetDTO } from "@/types/api";

type BudgetScope = MonthlyBudgetDTO["scope"];

const SCOPE_OPTIONS: ReadonlyArray<{ value: BudgetScope; label: string }> = [
  { value: "PERSONAL", label: "Pribadi" },
  { value: "SHARED", label: "Bersama" },
];

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function monthLabel(periodStart: string): string {
  const date = new Date(`${periodStart}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? periodStart : monthFormatter.format(date);
}

export interface BudgetCardProps {
  /** Household cap (SHARED), unchanged meaning. */
  budget: MonthlyBudgetDTO;
  /** The caller's own cap (PERSONAL); never summed with `budget`. */
  personalBudget: MonthlyBudgetDTO;
}

/**
 * Current-month budget (AC-F2-2, AC-F2-2c; design 02 §5 card 7). The mode pill
 * selects one independent cap: household (`Bersama`, default) or the caller's
 * own (`Pribadi`). The two amounts are never added together. When a cap is not
 * set the card shows the "atur budget" state instead of a misleading Rp0. Status
 * threshold chips are intentionally not rendered.
 */
export function BudgetCard({ budget, personalBudget }: BudgetCardProps) {
  const [scope, setScope] = useState<BudgetScope>("SHARED");
  const activeBudget = scope === "PERSONAL" ? personalBudget : budget;
  const isPersonal = scope === "PERSONAL";

  const spentPercent =
    activeBudget.isSet && activeBudget.budgetMinor && activeBudget.budgetMinor > 0
      ? Math.min(100, Math.round((activeBudget.spentMinor / activeBudget.budgetMinor) * 100))
      : 0;
  const longRemaining = formatIDR(activeBudget.remainingMinor ?? 0).length > 16;

  return (
    <section
      aria-labelledby="budget-title"
      className="rounded-3xl border border-card-border bg-card p-6 shadow-bento"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="budget-title" className="text-lg font-semibold text-ink">
          Anggaran bulan ini
        </h2>
        {activeBudget.isSet ? (
          <span className="shrink-0 rounded-full bg-chip-slate px-3 py-1 text-xs font-semibold text-ink-2">
            {monthLabel(activeBudget.periodStart)}
          </span>
        ) : null}
      </div>

      <SegmentedControl
        label="Cakupan anggaran"
        value={scope}
        options={SCOPE_OPTIONS}
        onChange={setScope}
        className="mt-3"
      />

      {activeBudget.isSet ? (
        <>
          <p
            className={
              longRemaining
                ? "mt-4 whitespace-nowrap text-[clamp(1.1rem,4.5vw,1.875rem)] font-bold leading-tight tracking-tight tabular-nums text-ink"
                : "mt-4 whitespace-nowrap text-[clamp(1.5rem,6vw,1.875rem)] font-bold leading-tight tracking-tight tabular-nums text-ink"
            }
          >
            {formatIDR(activeBudget.remainingMinor ?? 0)}
          </p>
          <p className="mt-0.5 text-sm font-medium text-ink-2">sisa anggaran</p>
          <div
            className="mt-4 h-3 overflow-hidden rounded-full bg-bar-track"
            role="img"
            aria-label={`${spentPercent} persen anggaran terpakai`}
          >
            <div
              className="h-full rounded-full bg-blue"
              style={{ width: `${spentPercent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs font-semibold text-ink-2">
            <span className="tabular-nums">{formatIDR(activeBudget.spentMinor)} sudah dipakai</span>
            <span className="tabular-nums">
              dari {formatIDR(activeBudget.budgetMinor ?? 0)} anggaran ({spentPercent}%)
            </span>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            {isPersonal
              ? "Dihitung dari dompet pribadimu."
              : "Dihitung dari dompet keluarga saja."}
          </p>
        </>
      ) : (
        <>
          <p className="mt-4 text-lg font-bold text-ink">
            {isPersonal ? "Belum ada anggaran pribadi bulan ini" : "Belum ada anggaran bulan ini"}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {isPersonal
              ? "Atur anggaran supaya pengeluaran pribadimu lebih terkendali."
              : "Atur anggaran supaya pengeluaran keluarga lebih terkendali."}
          </p>
          <Link
            href={isPersonal ? "/budget?scope=personal" : "/budget"}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand-green px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-green-hover"
          >
            Atur anggaran
          </Link>
          <p className="mt-3 text-xs text-ink-3">
            {isPersonal
              ? "Dihitung dari dompet pribadimu."
              : "Dihitung dari dompet keluarga saja."}
          </p>
        </>
      )}
    </section>
  );
}
