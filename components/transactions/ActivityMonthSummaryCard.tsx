"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import type { ActivityWalletSummaryDTO } from "@/types/api";

type Scope = "all" | "personal" | "shared";

export function ActivityMonthSummaryCard({
  month,
  scope,
  walletIds,
  refreshToken,
  onOpenReport,
}: {
  month: string;
  scope: Scope;
  walletIds: string[];
  refreshToken: number;
  onOpenReport?: () => void;
}) {
  const requestKey = `${month}:${scope}:${walletIds.join(",")}:${refreshToken}`;
  const [result, setResult] = useState<{ key: string; totals: {
    opening: number;
    income: number;
    expense: number;
    closing: number;
  } | null; error: boolean } | null>(null);
  const totals = result?.key === requestKey ? result.totals : null;
  const error = result?.key === requestKey && result.error;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ month, scope });
    walletIds.forEach((id) => params.append("walletId", id));
    apiRequest<ActivityWalletSummaryDTO>(`/api/reports/monthly/summary?${params.toString()}`)
      .then((response) => {
        if (!active) return;
        if (!response.ok || !response.data) {
          setResult({ key: requestKey, totals: null, error: true });
          return;
        }
        setResult({
          key: requestKey,
          totals: {
            opening: response.data.openingMinor,
            income: response.data.moneyInMinor,
            expense: response.data.moneyOutMinor,
            closing: response.data.closingMinor,
          },
          error: false,
        });
      })
      .catch(() => {
        if (active) setResult({ key: requestKey, totals: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [month, refreshToken, requestKey, scope, walletIds]);

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
      {onOpenReport ? (
        <button
          type="button"
          onClick={onOpenReport}
          className="mt-1 inline-flex min-h-11 w-full items-center gap-1 rounded-xl px-2 text-sm font-semibold text-blue hover:bg-blue-wash"
        >
          Lihat ringkasan lengkap
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
