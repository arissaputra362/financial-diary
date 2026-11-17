"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import type { ActivityWalletSummaryDTO } from "@/types/api";
import type { ActivityPeriod } from "./activityUrl";

type Scope = "all" | "personal" | "shared";

/**
 * Flow card for the activity list. One surface with dividers replaces the
 * previous four-tile grid (phase 2 mockup): the reader scans opening, in,
 * out, and closing in one line instead of four competing cards. It follows the
 * applied period, so a rolling window or custom range keeps the same card and
 * shows that period's summary.
 */
export function ActivityMonthSummaryCard({
  month,
  period,
  from,
  to,
  periodLabel,
  scope,
  walletIds,
  refreshToken,
  onOpenReport,
}: {
  month: string;
  period: ActivityPeriod;
  /** Resolved range start/end; used by every period except `month`. */
  from: string;
  to: string;
  /** Human-readable label for the applied period. */
  periodLabel: string;
  scope: Scope;
  walletIds: string[];
  refreshToken: number;
  onOpenReport?: () => void;
}) {
  const rangeKey = period === "month" ? "" : `${from}:${to}`;
  const requestKey = `${period}:${month}:${rangeKey}:${scope}:${walletIds.join(",")}:${refreshToken}`;
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
    const params = new URLSearchParams({ scope });
    if (period !== "month" && from && to) {
      params.set("from", from);
      params.set("to", to);
    } else {
      params.set("month", month);
    }
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
  }, [from, month, period, refreshToken, requestKey, scope, to, walletIds]);

  const metrics = [
    { label: "Saldo awal", value: totals?.opening },
    { label: "Uang masuk", value: totals?.income },
    { label: "Uang keluar", value: totals?.expense },
    { label: "Sisa saldo", value: totals?.closing },
  ];

  return (
    <section
      className="surface-hero overflow-hidden rounded-feature p-3 text-white shadow-bento sm:p-4"
      aria-label={`Ringkasan transaksi ${periodLabel}`}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="min-w-0 text-sm font-semibold text-white">Ringkasan {periodLabel}</p>
        {onOpenReport ? (
          <button
            type="button"
            onClick={onOpenReport}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Laporan
          </button>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-2xl bg-black/15 p-3">
            <dt className="text-xs font-semibold text-white/80">{metric.label}</dt>
            <dd
              className="financial-value mt-1.5 truncate text-[clamp(0.95rem,4vw,1.15rem)] font-bold tabular-nums text-white"
              aria-live="polite"
            >
              {totals ? formatIDR(metric.value ?? 0) : error ? "Tidak tersedia" : "Memuat..."}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
