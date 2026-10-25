"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, RefreshCw, Wallet } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import type { MonthlyBudgetDTO } from "@/types/api";
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
  sharedBudget: MonthlyBudgetDTO;
  personalBudget: MonthlyBudgetDTO;
  sharedTodayMinor: number;
  personalTodayMinor: number;
}

export function TotalWealthCard({
  sharedBalanceMinor,
  personalBalanceMinor,
  sharedBudget,
  personalBudget,
  sharedTodayMinor,
  personalTodayMinor,
}: TotalWealthCardProps) {
  const [scope, setScope] = useState<WealthScope>("SHARING");
  const [goldState, setGoldState] = useState<{
    scope: WealthScope;
    reloadKey: number;
    summary: GoldPortfolioSummaryDTO | null;
    error: boolean;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<GoldPortfolioSummaryDTO>(`/api/gold/assets?scope=${scope}`)
      .then((response) => {
        if (!active) return;
        setGoldState({
          scope,
          reloadKey,
          summary: response.ok ? response.data ?? null : null,
          error: !response.ok || !response.data,
        });
      })
      .catch(() => {
        if (active) setGoldState({ scope, reloadKey, summary: null, error: true });
      });

    return () => {
      active = false;
    };
  }, [scope, reloadKey]);

  const loading = goldState?.scope !== scope || goldState.reloadKey !== reloadKey;
  const error = !loading && goldState.error;
  const gold = !loading && !error ? goldState.summary : null;
  const cashBalance = scope === "SHARING" ? sharedBalanceMinor : personalBalanceMinor;
  const budget = scope === "SHARING" ? sharedBudget : personalBudget;
  const todayMinor = scope === "SHARING" ? sharedTodayMinor : personalTodayMinor;
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
            Ringkasan keuangan
          </h2>
          <p className="mt-1 text-xs text-[#B9CDE5]">
            Saldo, tabungan emas, dan pengeluaran sesuai pilihan.
          </p>
        </div>
        <div role="group" aria-label="Pilih ringkasan keuangan" className="flex rounded-full bg-white/10 p-1">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={scope === option.value}
              aria-label={`Tampilkan ringkasan ${option.label.toLowerCase()}`}
              onClick={() => setScope(option.value)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${scope === option.value ? "bg-white text-[#14273F] shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
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
          <p className="mt-2 text-[11px] text-[#B9CDE5]">Saldo mencakup dompet aktif dan arsip.</p>
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
      <div className="mt-5 border-t border-white/15 pt-4">
        <p className="text-xs font-semibold text-white/90">Pengeluaran bulan ini</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
          {formatIDR(budget.spentMinor)}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B9CDE5]">Hari ini</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatIDR(todayMinor)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B9CDE5]">Sisa anggaran</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {budget.isSet && budget.remainingMinor !== null ? formatIDR(budget.remainingMinor) : "Belum diatur"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
