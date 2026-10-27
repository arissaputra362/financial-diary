"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";
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
  const [totals, setTotals] = useState<{ income: number; expense: number } | null>(null);
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
      setTotals({ income: 0, expense: 0 });
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
          income: responses.reduce((sum, response) => sum + (response.data?.moneyInMinor ?? 0), 0),
          expense: responses.reduce((sum, response) => sum + (response.data?.moneyOutMinor ?? 0), 0),
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
    <section className="rounded-3xl border border-card-border bg-card p-5 shadow-bento" aria-label="Ringkasan transaksi bulan ini">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 rounded-2xl bg-mint p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <ArrowDownLeft className="h-4 w-4 text-green" aria-hidden="true" /> Uang masuk
          </p>
          <p className="mt-2 truncate text-lg font-bold tabular-nums text-ink" aria-live="polite">
            {totals ? formatIDR(totals.income) : error ? "—" : "Memuat..."}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-blue-wash p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <ArrowUpRight className="h-4 w-4 text-blue" aria-hidden="true" /> Uang keluar
          </p>
          <p className="mt-2 truncate text-lg font-bold tabular-nums text-ink" aria-live="polite">
            {totals ? formatIDR(totals.expense) : error ? "—" : "Memuat..."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenReport}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-between rounded-full px-2 text-sm font-semibold text-blue hover:bg-blue-wash"
      >
        Lihat ringkasan lengkap
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
