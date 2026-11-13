"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatDateLabel, monthKeyLabel } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityWalletSummaryDTO, DashboardSpendingDTO, SpendingDayDTO } from "@/types/api";

const weekdayFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "Asia/Jakarta",
});

type SummaryScope = "all" | "shared" | "personal";

const SCOPE_OPTIONS: Array<{ value: SummaryScope; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "shared", label: "Bersama" },
  { value: "personal", label: "Pribadi" },
];

const SCOPE_NOUN: Record<SummaryScope, string> = {
  all: "semua dompet",
  shared: "dompet bersama",
  personal: "dompet pribadi",
};

interface MonthlySummaryCardProps {
  month: string;
  spending: DashboardSpendingDTO;
  personalSpending: DashboardSpendingDTO;
  refreshToken: number;
}

type SummaryState = {
  key: string;
  income: number | null;
  expense: number | null;
  error: boolean;
};

/**
 * Monthly flow for the scope selected by the reader. Totals come from the
 * monthly summary endpoint. The bars reuse the dashboard series: shared and
 * personal are kept apart, and "Semua" only combines their daily transaction
 * flows for this chart. Balances are never added together here.
 */
export function MonthlySummaryCard({
  month,
  spending,
  personalSpending,
  refreshToken,
}: MonthlySummaryCardProps) {
  const [scope, setScope] = useState<SummaryScope>("all");
  const requestKey = `${month}:${scope}:${refreshToken}`;
  const [state, setState] = useState<SummaryState | null>(null);
  const loaded = state?.key === requestKey ? state : null;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ month, scope });
    apiRequest<ActivityWalletSummaryDTO>(
      `/api/reports/monthly/summary?${params.toString()}`,
    )
      .then((response) => {
        if (!active) return;
        if (!response.ok || !response.data) {
          setState({ key: requestKey, income: null, expense: null, error: true });
          return;
        }
        setState({
          key: requestKey,
          income: response.data.moneyInMinor,
          expense: response.data.moneyOutMinor,
          error: false,
        });
      })
      .catch(() => {
        if (active) {
          setState({ key: requestKey, income: null, expense: null, error: true });
        }
      });
    return () => {
      active = false;
    };
  }, [month, scope, refreshToken, requestKey]);

  const days = daysForScope(scope, spending, personalSpending);
  const maxAmount = Math.max(1, ...days.map((day) => day.amountMinor));
  const hasSpending = days.some((day) => day.amountMinor > 0);
  const chartTotal = days.reduce((total, day) => total + day.amountMinor, 0);
  const scopeNoun = SCOPE_NOUN[scope];
  const reportParams = new URLSearchParams({ view: "ringkasan", month });
  if (scope !== "all") reportParams.set("scope", scope);
  const reportHref = `/transactions?${reportParams.toString()}`;

  return (
    <section
      aria-labelledby="monthly-summary-title"
      className="flex h-full flex-col rounded-feature border border-card-border bg-card p-4 shadow-bento"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="monthly-summary-title" className="text-base font-semibold text-ink">
            Ringkasan bulan ini
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">{monthKeyLabel(month)}</p>
        </div>
        <div
          role="group"
          aria-label="Pilih cakupan ringkasan"
          className="inline-flex w-full rounded-full bg-surface-subtle p-0.5 sm:w-auto"
        >
          {SCOPE_OPTIONS.map((option) => {
            const selected = scope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setScope(option.value)}
                className={cn(
                  "min-h-11 flex-1 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:flex-none",
                  selected
                    ? "bg-card text-green shadow-sm"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="min-w-0 rounded-2xl bg-surface-subtle p-2.5">
          <p className="text-xs font-medium text-ink-2">Pemasukan</p>
          <p className="financial-value mt-0.5 truncate text-base font-bold text-green" aria-live="polite">
            {loaded
              ? loaded.error
                ? "Tidak tersedia"
                : formatIDR(loaded.income ?? 0)
              : "Memuat..."}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-surface-subtle p-2.5">
          <p className="text-xs font-medium text-ink-2">Pengeluaran</p>
          <p className="financial-value mt-0.5 truncate text-base font-bold text-danger" aria-live="polite">
            {loaded
              ? loaded.error
                ? "Tidak tersedia"
                : formatIDR(loaded.expense ?? 0)
              : "Memuat..."}
          </p>
        </div>
      </div>

      {loaded?.error ? (
        <div className="mt-4 rounded-2xl border border-danger-border bg-danger-bg p-3 text-sm text-danger">
          <p>Ringkasan bulan ini belum bisa dimuat.</p>
          <Link
            href={reportHref}
            className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-xl font-semibold underline underline-offset-2"
          >
            Buka ringkasan lengkap
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink-2">Pengeluaran 7 hari terakhir</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
              <span className="h-2 w-2 rounded-full bg-expense" aria-hidden="true" />
              Harian
            </span>
          </div>

          {hasSpending ? (
            <div className="mt-2">
              <div
                role="img"
                aria-label={`Grafik pengeluaran harian 7 hari terakhir untuk ${scopeNoun}. Total ${formatIDR(chartTotal)}.`}
                className="flex h-20 items-end gap-1.5"
              >
                {days.map((day) => {
                  const height = Math.max(6, Math.round((day.amountMinor / maxAmount) * 72));
                  return (
                    <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div className="flex h-[72px] w-full items-end">
                        <div
                          className="mx-auto w-3 rounded-full bg-expense/85 sm:w-3.5"
                          style={{ height: `${height}px` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-ink-3">
                        {weekdayFormatter.format(new Date(`${day.date}T00:00:00+07:00`))}
                      </span>
                    </div>
                  );
                })}
              </div>
              <ul className="sr-only">
                {days.map((day) => (
                  <li key={day.date}>
                    {formatDateLabel(`${day.date}T12:00:00+07:00`)}: {formatIDR(day.amountMinor)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl bg-surface-subtle p-4 text-center">
              <p className="text-sm font-semibold text-ink">Belum ada pengeluaran</p>
              <p className="mt-1 text-xs text-ink-2">
                {scope === "all"
                  ? "Pengeluaran yang kamu catat akan muncul di sini."
                  : `Pengeluaran dari ${scopeNoun} akan muncul di sini.`}
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-row-divider pt-2.5">
        <p className="text-[11px] text-ink-3">
          {loaded?.error ? "Data bulan ini belum tersedia." : `Angka dari ${scopeNoun}.`}
        </p>
        <Link
          href={reportHref}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-1 text-xs font-semibold text-green hover:text-green-hover"
        >
          Lihat ringkasan
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {loaded?.error ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl text-xs font-semibold text-green"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Muat ulang halaman
        </button>
      ) : null}
    </section>
  );
}

function daysForScope(
  scope: SummaryScope,
  shared: DashboardSpendingDTO,
  personal: DashboardSpendingDTO,
): SpendingDayDTO[] {
  if (scope === "shared") return shared.byDay.slice(-7);
  if (scope === "personal") return personal.byDay.slice(-7);

  const amountByDate = new Map<string, number>();
  for (const day of [...shared.byDay, ...personal.byDay]) {
    amountByDate.set(day.date, (amountByDate.get(day.date) ?? 0) + day.amountMinor);
  }
  return Array.from(amountByDate, ([date, amountMinor]) => ({ date, amountMinor }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
}
