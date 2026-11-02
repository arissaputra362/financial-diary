"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import type { MonthlyReportDTO } from "@/types/api";

type Scope = "all" | "personal" | "shared";

export function ActivityMonthSummaryCard({
  month,
  scope,
  walletId,
  walletScope,
  hasPersonalWallet,
  onOpenReport,
}: {
  month: string;
  scope: Scope;
  walletId: string;
  walletScope?: "PERSONAL" | "SHARING";
  hasPersonalWallet: boolean;
  onOpenReport: () => void;
}) {
  const [totals, setTotals] = useState<{
    opening: number;
    income: number;
    expense: number;
    closing: number;
  } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (walletId && !walletScope) {
      setTotals(null);
      return;
    }
    const selectedScope = walletId
      ? walletScope === "PERSONAL" ? "personal" : "shared"
      : null;
    if (walletId && scope !== "all" && selectedScope !== scope) {
      setTotals({ opening: 0, income: 0, expense: 0, closing: 0 });
      setError(false);
      return;
    }
    const scopes = walletId
      ? [selectedScope!]
      : scope === "all"
        ? hasPersonalWallet ? ["shared", "personal"] : ["shared"]
        : [scope];
    setTotals(null);
    setError(false);
    Promise.all(scopes.map((reportScope) => {
      const params = new URLSearchParams({ month, scope: reportScope });
      if (walletId) params.set("walletId", walletId);
      return apiRequest<MonthlyReportDTO>(`/api/reports/monthly?${params.toString()}`);
    }))
      .then((responses) => {
        if (!active) return;
        if (responses.some((response) => !response.ok || !response.data)) {
          setError(true);
          return;
        }
        setTotals({
          opening: responses.reduce((sum, response) => sum + (response.data?.openingMinor ?? 0), 0),
          income: responses.reduce((sum, response) => sum + (response.data?.moneyInMinor ?? 0), 0),
          expense: responses.reduce((sum, response) => sum + (response.data?.moneyOutMinor ?? 0), 0),
          closing: responses.reduce((sum, response) => sum + (response.data?.closingMinor ?? 0), 0),
        });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [hasPersonalWallet, month, scope, walletId, walletScope]);

  return (
    <section className="rounded-3xl border border-card-border bg-card p-3 shadow-bento" aria-label="Ringkasan transaksi bulan ini">
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-2xl bg-blue-wash p-3">
          <p className="text-xs font-semibold text-ink-2">Saldo awal</p>
          <p className="mt-2 whitespace-nowrap text-[clamp(0.75rem,3.4vw,1.125rem)] font-bold tracking-tight tabular-nums text-ink" aria-live="polite">
            {totals ? formatIDR(totals.opening) : error ? "Tidak tersedia" : "Memuat..."}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-blue-wash p-3">
          <p className="text-xs font-semibold text-ink-2">Uang masuk</p>
          <p className="mt-2 whitespace-nowrap text-[clamp(0.75rem,3.4vw,1.125rem)] font-bold tracking-tight tabular-nums text-ink" aria-live="polite">
            {totals ? formatIDR(totals.income) : error ? "Tidak tersedia" : "Memuat..."}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-blue-wash p-3">
          <p className="text-xs font-semibold text-ink-2">Uang keluar</p>
          <p className="mt-2 whitespace-nowrap text-[clamp(0.75rem,3.4vw,1.125rem)] font-bold tracking-tight tabular-nums text-ink" aria-live="polite">
            {totals ? formatIDR(totals.expense) : error ? "Tidak tersedia" : "Memuat..."}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-blue-wash p-3">
          <p className="text-xs font-bold text-blue">Sisa saldo</p>
          <p className="mt-2 whitespace-nowrap text-[clamp(0.75rem,3.4vw,1.125rem)] font-extrabold tracking-tight tabular-nums text-ink" aria-live="polite">
            {totals ? formatIDR(totals.closing) : error ? "Tidak tersedia" : "Memuat..."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenReport}
        className="mt-1 inline-flex min-h-11 w-full items-center gap-1 rounded-xl px-2 text-sm font-semibold text-blue hover:bg-blue-wash"
      >
        Lihat ringkasan lengkap
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
