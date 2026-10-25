"use client";

import { useEffect, useState } from "react";
import { Coins, TrendingDown, TrendingUp } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { formatGrams } from "@/lib/gold";
import { apiRequest } from "@/lib/api-client";
import type { GoldPortfolioSummaryDTO } from "@/types/gold";

interface GoldReportSectionProps {
  scope: "personal" | "shared";
  liquidBalanceMinor: number;
}

export function GoldReportSection({ scope, liquidBalanceMinor }: GoldReportSectionProps) {
  const [data, setData] = useState<GoldPortfolioSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const scopeParam = scope === "shared" ? "SHARING" : "PERSONAL";

    apiRequest<GoldPortfolioSummaryDTO>(`/api/gold/assets?scope=${scopeParam}`)
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setData(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [scope]);

  if (loading || !data || data.itemCount === 0) {
    return null;
  }

  const totalNetWorthMinor = liquidBalanceMinor + data.totalEstimatedValueMinor;
  const goldPercentage =
    totalNetWorthMinor > 0
      ? Math.round((data.totalEstimatedValueMinor / totalNetWorthMinor) * 100)
      : 0;

  return (
    <div className="rounded-3xl border border-[#D8E2EE] bg-[#F8FAFC] p-6 shadow-xs print:break-inside-avoid">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#46597A]">
          <Coins className="h-4 w-4 text-amber-500" aria-hidden="true" />
          Aset Emas & Logam Mulia ({scope === "shared" ? "Bersama" : "Pribadi"})
        </h3>
        <span className="text-xs text-[#5C7191]">
          {formatGrams(data.totalWeightGrams)} · {data.itemCount} item
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#EAEEF4] bg-white p-4">
          <p className="text-xs text-[#5C7191]">Taksiran Nilai Pasar Terkini</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#17304F]">
            {formatIDR(data.totalEstimatedValueMinor)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {data.totalUnrealizedPnLMinor >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-[#166534]" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-[#B91C1C]" />
            )}
            <span
              className={`font-semibold tabular-nums ${
                data.totalUnrealizedPnLMinor >= 0
                  ? "text-[#166534]"
                  : "text-[#B91C1C]"
              }`}
            >
              {data.totalUnrealizedPnLMinor >= 0 ? "+" : ""}
              {formatIDR(data.totalUnrealizedPnLMinor)} (
              {data.totalUnrealizedPnLMinor >= 0 ? "+" : ""}
              {data.totalUnrealizedPnLPercent}%)
            </span>
            <span className="text-[#5C7191]">vs modal beli</span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#EAEEF4] bg-white p-4">
          <p className="text-xs text-[#5C7191]">Porsi dalam Total Aset Keluarga</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#17304F]">
            {goldPercentage}% Emas
          </p>
          <p className="mt-2 text-xs text-[#5C7191]">
            Kas Cair: <strong className="tabular-nums text-[#17304F]">{formatIDR(liquidBalanceMinor)}</strong> · Total:{" "}
            <strong className="tabular-nums text-[#17304F]">{formatIDR(totalNetWorthMinor)}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
