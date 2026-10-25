"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Coins,
  Gem,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatIDR } from "@/lib/format";
import { formatGrams } from "@/lib/gold";
import { apiRequest } from "@/lib/api-client";
import { GoldAssetModal } from "@/components/gold/GoldAssetModal";
import type { GoldPortfolioSummaryDTO } from "@/types/gold";

export function GoldPageView() {
  const [data, setData] = useState<GoldPortfolioSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [undoItem, setUndoItem] = useState<{ id: string; name: string } | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await apiRequest<GoldPortfolioSummaryDTO>("/api/gold/assets");
      if (res.ok && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError("Belum bisa memuat tabungan emas.");
      }
    } catch {
      setError("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus catatan "${name}"? Dapat dibatalkan dalam 5 detik.`)) return;
    setDeletingId(id);
    try {
      const res = await apiRequest(`/api/gold/assets/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUndoItem({ id, name });
        await loadData();
        setTimeout(() => {
          setUndoItem((current) => (current?.id === id ? null : current));
        }, 5000);
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRestore(id: string) {
    try {
      const res = await apiRequest(`/api/gold/assets/${id}/restore`, { method: "POST" });
      if (res.ok) {
        setUndoItem(null);
        await loadData();
      }
    } catch (e) {
      console.error("Gagal membatalkan penghapusan", e);
    }
  }

  const antamPrice = data?.priceInfo?.prices?.find((p) => p.brand === "ANTAM");
  const ubsPrice = data?.priceInfo?.prices?.find((p) => p.brand === "UBS");

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-28 sm:px-6 lg:max-w-3xl">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/home"
            aria-label="Kembali ke Beranda"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D8E2EE] bg-white text-[#5C7191] shadow-xs hover:bg-[#F1F5FA]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-[#17304F]">
              <Coins className="h-5 w-5 text-amber-500" aria-hidden="true" />
              Tabungan Emas
            </h1>
            <p className="mt-0.5 text-xs text-[#5C7191]">
              Logam mulia batangan &amp; emas perhiasan keluarga
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#166534] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#155C30]"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Emas
          </button>
        </div>
      </div>

      {/* Undo Toast */}
      {undoItem ? (
        <div className="flex items-center justify-between rounded-2xl bg-[#14273F] px-4 py-3 text-sm text-white shadow-lg animate-in fade-in">
          <span>&ldquo;{undoItem.name}&rdquo; telah dihapus.</span>
          <button
            type="button"
            onClick={() => handleRestore(undoItem.id)}
            className="font-bold text-[#DCFCE7] underline underline-offset-2 hover:text-white"
          >
            Batalkan (Undo)
          </button>
        </div>
      ) : null}

      {/* Live Price Ticker */}
      {antamPrice || data?.priceInfo?.isStale ? (
        <div className="flex flex-wrap gap-2">
          {antamPrice ? (
            <div className="flex items-center gap-2 rounded-full border border-[#DCEBFA] bg-[#F1F5FA] px-3.5 py-1.5 text-[11px] font-medium text-[#17304F]">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span>
                Antam buyback:{" "}
                <strong className="tabular-nums">{formatIDR(antamPrice.buybackPriceMinor)}</strong>/gr
              </span>
            </div>
          ) : null}
          {ubsPrice ? (
            <div className="flex items-center gap-2 rounded-full border border-[#DCEBFA] bg-[#F1F5FA] px-3.5 py-1.5 text-[11px] font-medium text-[#17304F]">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span>
                UBS buyback:{" "}
                <strong className="tabular-nums">{formatIDR(ubsPrice.buybackPriceMinor)}</strong>/gr
              </span>
            </div>
          ) : null}
          {data?.priceInfo?.isStale ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700">
              <span>⚠</span>{" "}
              {data.priceInfo.prices.length > 0
                ? `Harga terakhir ${data.priceInfo.prices[0].sourceDate} (cache)`
                : "Harga belum tersedia; belum ada cache"}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Loading State */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1D4F87] border-t-transparent" />
        </div>
      ) : error ? (
        /* Error State */
        <div className="rounded-3xl border border-[#D8E2EE] bg-white p-8 text-center shadow-bento">
          <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1D4F87] px-4 py-2 text-xs font-semibold text-white hover:bg-[#153D6B]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Coba lagi
            </button>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-5">
          {/* Portfolio Summary Card */}
          <div className="rounded-3xl border border-[#D8E2EE] bg-white p-6 shadow-bento">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#46597A]">
              Total Portofolio Emas
            </p>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-3xl font-extrabold tracking-tight tabular-nums text-[#17304F] sm:text-4xl">
                  {formatIDR(data.totalEstimatedValueMinor)}
                </p>
                <p className="mt-1 text-xs text-[#46597A]">
                  Taksiran nilai pasar · Modal beli:{" "}
                  <span className="font-semibold tabular-nums text-[#17304F]">
                    {formatIDR(data.totalCostBasisMinor)}
                  </span>
                </p>
              </div>

              {data.totalCostBasisMinor > 0 ? (
                <div
                  className={`flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold sm:self-auto ${
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
                    {formatIDR(data.totalUnrealizedPnLMinor)} (
                    {data.totalUnrealizedPnLMinor >= 0 ? "+" : ""}
                    {data.totalUnrealizedPnLPercent}%)
                  </span>
                </div>
              ) : null}
            </div>

            {/* Gram Breakdown */}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-xl bg-[#EFF4FA] px-3 py-1 font-semibold text-[#1D4F87]">
                Total: {formatGrams(data.totalWeightGrams)}
              </span>
              <span className="rounded-xl bg-[#F8FAFC] px-3 py-1 text-[#46597A]">
                Batangan: {formatGrams(data.bullionWeightGrams)}
              </span>
              <span className="rounded-xl bg-[#F8FAFC] px-3 py-1 text-[#46597A]">
                Perhiasan: {formatGrams(data.jewelryWeightGrams)}
              </span>
              <span className="rounded-xl bg-[#F8FAFC] px-3 py-1 text-[#46597A]">
                {data.itemCount} item
              </span>
            </div>
          </div>

          {/* Asset List */}
          {data.assets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#BCD6EF] bg-[#F8FAFC] p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <Coins className="h-7 w-7" />
              </div>
              <p className="mt-4 font-semibold text-[#17304F]">Belum ada catatan emas</p>
              <p className="mt-1 text-xs text-[#5C7191]">
                Catat emas batangan Antam/UBS atau perhiasan keluargamu agar tercatat rapi.
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#166534] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#155C30]"
              >
                <Plus className="h-4 w-4" />
                Catat Emas Pertama
              </button>
            </div>
          ) : (
            <section aria-labelledby="gold-asset-list-title">
              <h2
                id="gold-asset-list-title"
                className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#46597A]"
              >
                Daftar Aset ({data.assets.length})
              </h2>
              <div className="space-y-2.5">
                {data.assets.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-2xl border border-[#EAEEF4] bg-white p-4 text-sm shadow-xs transition hover:border-[#BCD6EF]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                        {item.type === "BULLION" ? (
                          <Coins className="h-5 w-5" />
                        ) : (
                          <Gem className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-[#17304F]">{item.name}</p>
                        <p className="mt-0.5 text-xs text-[#5C7191]">
                          {formatGrams(item.weightGrams)} · {item.purityLabel}
                          {item.scope === "PERSONAL" ? (
                            <span className="ml-1.5 rounded-sm bg-[#EFF4FA] px-1.5 py-0.5 text-[10px] font-semibold text-[#1D4F87]">
                              Pribadi
                            </span>
                          ) : (
                            <span className="ml-1.5 rounded-sm bg-[#F0FDF4] px-1.5 py-0.5 text-[10px] font-semibold text-[#166534]">
                              Bersama
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#9BAFC8]">
                          Beli: {formatIDR(item.buyPriceMinor)} · {item.purchaseDate}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-bold tabular-nums text-[#17304F]">
                          {formatIDR(item.estimatedValuationMinor)}
                        </p>
                        <p
                          className={`text-xs tabular-nums ${
                            item.unrealizedPnLMinor >= 0
                              ? "text-[#166534]"
                              : "text-[#B91C1C]"
                          }`}
                        >
                          {item.unrealizedPnLMinor >= 0 ? "+" : ""}
                          {formatIDR(item.unrealizedPnLMinor)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={deletingId === item.id}
                        onClick={() => handleDelete(item.id, item.name)}
                        aria-label={`Hapus ${item.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#5C7191] hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            </section>
          )}
        </div>
      ) : null}

      <GoldAssetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => loadData()}
      />
    </div>
  );
}
