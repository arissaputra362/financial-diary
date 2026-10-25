"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Coins, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { formatGrams } from "@/lib/gold";
import { apiRequest } from "@/lib/api-client";
import type { GoldPortfolioSummaryDTO } from "@/types/gold";

/**
 * Compact gold savings summary card for the dashboard homepage.
 * Shows total value, total grams, PnL, and links to the full /gold page.
 */
export function GoldSummaryCard() {
  const [data, setData] = useState<GoldPortfolioSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<GoldPortfolioSummaryDTO>("/api/gold/assets")
      .then((res) => {
        if (res.ok && res.data) setData(res.data);
      })
      .catch(() => {
        // Silently fail — this is a summary card, not the main gold view
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section
      aria-labelledby="gold-summary-title"
      className="relative rounded-3xl border border-[#D8E2EE] bg-white p-6 shadow-bento"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          id="gold-summary-title"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#46597A]"
        >
          <Coins className="h-4 w-4 text-amber-500" aria-hidden="true" />
          Tabungan Emas
        </h2>
        <Link
          href="/gold"
          className="flex items-center gap-0.5 text-xs font-semibold text-[#1D4F87] hover:underline"
          aria-label="Lihat semua tabungan emas"
        >
          Lihat semua
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        /* Skeleton */
        <div className="mt-4 space-y-2">
          <div className="h-8 w-40 animate-pulse rounded-xl bg-[#EFF4FA]" />
          <div className="h-4 w-24 animate-pulse rounded-lg bg-[#F1F5FA]" />
        </div>
      ) : data ? (
        data.itemCount === 0 ? (
          /* Empty */
          <div className="mt-5 flex flex-col items-start gap-3">
            <p className="text-sm text-[#5C7191]">Belum ada catatan emas.</p>
            <Link
              href="/gold"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#166534] px-4 py-2 text-xs font-semibold text-white hover:bg-[#155C30]"
            >
              <Plus className="h-3.5 w-3.5" />
              Catat Emas
            </Link>
          </div>
        ) : (
          /* Data */
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-[#17304F]">
                {formatIDR(data.totalEstimatedValueMinor)}
              </p>
              <p className="mt-0.5 text-xs text-[#5C7191]">
                {formatGrams(data.totalWeightGrams)} · {data.itemCount} item
              </p>
            </div>

            {data.totalCostBasisMinor > 0 ? (
              <div
                className={`flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-bold sm:self-auto ${
                  data.totalUnrealizedPnLMinor >= 0
                    ? "bg-[#DCFCE7] text-[#166534]"
                    : "bg-[#FDECEC] text-[#B91C1C]"
                }`}
              >
                {data.totalUnrealizedPnLMinor >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                <span className="tabular-nums">
                  {data.totalUnrealizedPnLMinor >= 0 ? "+" : ""}
                  {formatIDR(data.totalUnrealizedPnLMinor)}
                </span>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {/* Footer link */}
      {data && data.itemCount > 0 ? (
        <Link
          href="/gold"
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#D8E2EE] py-2.5 text-xs font-semibold text-[#5C7191] hover:border-[#BCD6EF] hover:text-[#17304F]"
        >
          Kelola Tabungan Emas
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </section>
  );
}
