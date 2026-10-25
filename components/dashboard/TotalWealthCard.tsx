"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, RefreshCw, Wallet } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import type { GoldPortfolioSummaryDTO } from "@/types/gold";

type WealthScope = "SHARING" | "PERSONAL";

const SCOPE_OPTIONS = [
  { value: "SHARING" as const, label: "Bersama" },
  { value: "PERSONAL" as const, label: "Pribadi" },
];

const priceDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

interface TotalWealthCardProps {
  sharedBalanceMinor: number;
  personalBalanceMinor: number;
}

export function TotalWealthCard({ sharedBalanceMinor, personalBalanceMinor }: TotalWealthCardProps) {
  const [scope, setScope] = useState<WealthScope>("SHARING");
  const [gold, setGold] = useState<GoldPortfolioSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setGold(null);

    apiRequest<GoldPortfolioSummaryDTO>(`/api/gold/assets?scope=${scope}`)
      .then((response) => {
        if (!active) return;
        if (response.ok && response.data) setGold(response.data);
        else setError(true);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [scope, reloadKey]);

  const cashBalance = scope === "SHARING" ? sharedBalanceMinor : personalBalanceMinor;
  const hasGoldItems = (gold?.itemCount ?? 0) > 0;
  const hasGoldPrice = Boolean(gold?.priceInfo.prices.length);
  const canCalculateTotal = !error && !loading && gold !== null && (!hasGoldItems || hasGoldPrice);
  const totalWealth = canCalculateTotal
    ? cashBalance + (hasGoldItems ? gold.totalEstimatedValueMinor : 0)
    : null;
  const priceDate = hasGoldPrice
    ? gold?.priceInfo.prices.reduce((earliest, price) => price.sourceDate < earliest ? price.sourceDate : earliest, "9999-12-31")
    : null;
  const priceDateLabel = priceDate
    ? priceDateFormatter.format(new Date(`${priceDate}T00:00:00+07:00`))
    : null;

  return (
    <section aria-labelledby="total-wealth-title" className="overflow-hidden rounded-3xl bg-[#14273F] p-5 text-white shadow-bento sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="total-wealth-title" className="flex items-center gap-2 text-sm font-semibold text-white/90">
            <Wallet className="h-4 w-4" aria-hidden="true" />
            Total kekayaan saat ini
          </h2>
          <p className="mt-1 text-xs text-[#B9CDE5]">
            Uang tersedia ditambah taksiran nilai tabungan emas.
          </p>
        </div>
        <div role="group" aria-label="Cakupan total kekayaan" className="flex rounded-full bg-white/10 p-1">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={scope === option.value}
              onClick={() => setScope(option.value)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${scope === option.value ? "bg-white text-[#14273F] shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-5 h-10 w-48 animate-pulse rounded-xl bg-white/10" aria-label="Memuat total kekayaan" />
      ) : error ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/10 p-4">
          <div>
            <p className="font-semibold">Total belum bisa dihitung.</p>
            <p className="mt-1 text-xs text-[#B9CDE5]">Data tabungan emas belum berhasil dimuat.</p>
            <p className="mt-2 text-xs text-white/80">Uang tersedia: {formatIDR(cashBalance)}</p>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-[#14273F] hover:bg-[#EAF1F8]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Coba lagi
          </button>
        </div>
      ) : totalWealth === null ? (
        <div className="mt-5 rounded-2xl bg-white/10 p-4">
          <p className="font-semibold">Total belum bisa dihitung.</p>
          <p className="mt-1 text-xs text-[#B9CDE5]">Harga emas belum tersedia untuk menaksir nilainya.</p>
          <p className="mt-2 text-xs text-white/80">Uang tersedia: {formatIDR(cashBalance)}</p>
        </div>
      ) : (
        <>
          <p className="mt-5 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
            {formatIDR(totalWealth)}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="text-xs text-[#B9CDE5]">Uang tersedia {scope === "SHARING" ? "bersama" : "pribadi"}</p>
              <p className="mt-1 font-semibold tabular-nums">{formatIDR(cashBalance)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="flex items-center gap-1.5 text-xs text-[#B9CDE5]">
                <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                Tabungan emas {scope === "SHARING" ? "bersama" : "pribadi"}
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatIDR(hasGoldItems ? gold?.totalEstimatedValueMinor ?? 0 : 0)}
              </p>
            </div>
          </div>
          {hasGoldItems ? (
            <p className="mt-3 text-xs text-[#B9CDE5]">
              Nilai emas adalah taksiran berdasarkan harga acuan{priceDateLabel ? ` per ${priceDateLabel}` : " terbaru"}.
            </p>
          ) : (
            <p className="mt-3 text-xs text-[#B9CDE5]">Belum ada tabungan emas pada cakupan ini.</p>
          )}
          <Link href="/gold" className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-white underline underline-offset-4 hover:text-[#DCEBFA]">
            Lihat tabungan emas
          </Link>
        </>
      )}
    </section>
  );
}
