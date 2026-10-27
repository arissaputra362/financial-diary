"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  Gem,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatGrams } from "@/lib/gold";
import { apiRequest } from "@/lib/api-client";
import { GoldAssetModal } from "@/components/gold/GoldAssetModal";
import { GoldAssetDetailModal } from "@/components/gold/GoldAssetDetailModal";
import { GoldAssetArtwork } from "@/components/gold/GoldAssetArtwork";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import type { GoldPortfolioSummaryDTO } from "@/types/gold";

export function GoldPageView() {
  const router = useRouter();
  const [data, setData] = useState<GoldPortfolioSummaryDTO | null>(null);
  const [amountsVisible, setAmountsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<GoldPortfolioSummaryDTO["assets"][number] | null>(null);
  const [editingAsset, setEditingAsset] = useState<GoldPortfolioSummaryDTO["assets"][number] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [undoItem, setUndoItem] = useState<{ id: string; name: string } | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await apiRequest<GoldPortfolioSummaryDTO>("/api/gold/assets");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        router.replace("/waiting-for-approval");
        return;
      }
      if (res.ok && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(
          res.data?.error?.message ??
            (res.status === 401
              ? "Sesi kamu berakhir. Silakan masuk kembali."
              : "Belum bisa memuat tabungan emas. Coba lagi sebentar.")
        );
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

  async function handleDelete() {
    const candidate = assetToDelete;
    if (!candidate) return;
    const { id, name } = candidate;
    setDeletingId(id);
    try {
      const res = await apiRequest(`/api/gold/assets/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUndoItem({ id, name });
        setSelectedAsset(null);
        setAssetToDelete(null);
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
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Tabungan Emas"
        icon={Coins}
        iconClassName="text-gold-accent"
        titleClassName="text-xl font-extrabold"
        description="Logam mulia batangan & emas perhiasan keluarga"
        descriptionClassName="text-xs"
        leading={
          <Link
            href="/home"
            aria-label="Kembali ke Beranda"
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-card-border bg-card text-ink-3 shadow-xs hover:bg-canvas md:flex"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
        beforeTitle={
          <Link
            href="/profile"
            className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-blue hover:bg-blue-wash md:hidden"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke Profil
          </Link>
        }
        actions={
          <div className="grid w-full grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-green px-4 text-sm font-semibold text-white shadow-xs hover:bg-brand-green-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tambah Emas
            </button>
            <button
              type="button"
              onClick={() => setAmountsVisible((visible) => !visible)}
              aria-label={amountsVisible ? "Sembunyikan nominal" : "Tampilkan nominal"}
              aria-pressed={amountsVisible}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-card-border bg-card text-ink-2 shadow-xs hover:bg-canvas"
            >
              {amountsVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        }
      />

      {/* Undo Toast */}
      {undoItem ? (
        <div className="flex items-center justify-between rounded-2xl bg-navy px-4 py-3 text-sm text-white shadow-lg animate-in fade-in">
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
            <div className="flex items-center gap-2 rounded-full border border-blue-tint bg-canvas px-3.5 py-1.5 text-[11px] font-medium text-ink">
              <span className="inline-block h-2 w-2 rounded-full bg-green" />
              <span>
                Antam buyback:{" "}
                <strong className="tabular-nums">{amountsVisible ? formatIDR(antamPrice.buybackPriceMinor) : "****"}</strong>/gr
              </span>
            </div>
          ) : null}
          {ubsPrice ? (
            <div className="flex items-center gap-2 rounded-full border border-blue-tint bg-canvas px-3.5 py-1.5 text-[11px] font-medium text-ink">
              <span className="inline-block h-2 w-2 rounded-full bg-green" />
              <span>
                UBS buyback:{" "}
                <strong className="tabular-nums">{amountsVisible ? formatIDR(ubsPrice.buybackPriceMinor) : "****"}</strong>/gr
              </span>
            </div>
          ) : null}
          {data?.priceInfo?.isStale ? (
            <span className="flex items-center gap-1 rounded-full bg-warning-bg px-3 py-1 text-[11px] font-medium text-warning">
              <span aria-hidden="true">⚠</span>{" "}
              {data.priceInfo.prices.length > 0
                ? `Harga terakhir ${data.priceInfo.prices[0].sourceDate}`
                : "Harga emas belum tersedia"}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Loading State */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue border-t-transparent" />
        </div>
      ) : error ? (
        /* Error State */
        <div className="rounded-3xl border border-card-border bg-card p-8 text-center shadow-bento">
          <p className="text-sm font-semibold text-danger">{error}</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-hover"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Coba lagi
            </button>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-5">
          {/* Portfolio Summary Card */}
          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-bento">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Total Portofolio Emas
            </p>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-3xl font-extrabold tracking-tight tabular-nums text-ink sm:text-4xl">
                  {amountsVisible ? formatIDR(data.totalEstimatedValueMinor) : "****"}
                </p>
                <p className="mt-1 text-xs text-ink-2">
                  Taksiran nilai pasar · Modal beli:{" "}
                  <span className="font-semibold tabular-nums text-ink">
                    {amountsVisible ? formatIDR(data.totalCostBasisMinor) : "****"}
                  </span>
                </p>
              </div>

              {data.totalCostBasisMinor > 0 ? (
                <div
                  className={`flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold sm:self-auto ${
                    data.totalUnrealizedPnLMinor >= 0
                      ? "bg-mint text-green"
                      : "bg-danger-bg text-danger"
                  }`}
                >
                  {data.totalUnrealizedPnLMinor >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  <span className="tabular-nums">
                    {data.totalUnrealizedPnLMinor >= 0 ? "+" : ""}
                    {amountsVisible ? formatIDR(data.totalUnrealizedPnLMinor) : "****"} (
                    {data.totalUnrealizedPnLMinor >= 0 ? "+" : ""}
                    {data.totalUnrealizedPnLPercent}%)
                  </span>
                </div>
              ) : null}
            </div>

            {/* Gram Breakdown */}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-xl bg-blue-wash px-3 py-1 font-semibold text-blue">
                Total: {formatGrams(data.totalWeightGrams)}
              </span>
              <span className="rounded-xl bg-surface-subtle px-3 py-1 text-ink-2">
                Batangan: {formatGrams(data.bullionWeightGrams)}
              </span>
              <span className="rounded-xl bg-surface-subtle px-3 py-1 text-ink-2">
                Perhiasan: {formatGrams(data.jewelryWeightGrams)}
              </span>
              <span className="rounded-xl bg-surface-subtle px-3 py-1 text-ink-2">
                {data.itemCount} item
              </span>
            </div>
          </div>

          {/* Asset List */}
          {data.assets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-blue-border bg-surface-subtle p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-bg text-gold-accent">
                <Coins className="h-7 w-7" />
              </div>
              <p className="mt-4 font-semibold text-ink">Belum ada catatan emas</p>
              <p className="mt-1 text-xs text-ink-3">
                Catat emas batangan Antam/UBS atau perhiasan keluargamu agar tercatat rapi.
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-green-hover"
              >
                <Plus className="h-4 w-4" />
                Catat Emas Pertama
              </button>
            </div>
          ) : (
            <section aria-labelledby="gold-asset-list-title">
              <h2
                id="gold-asset-list-title"
                className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-2"
              >
                Daftar Aset ({data.assets.length})
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.assets.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedAsset(item)}
                    aria-label={`Lihat detail ${item.name}`}
                    className="group min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-card-border bg-card text-sm shadow-xs transition hover:-translate-y-0.5 hover:border-blue-border hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                  >
                    <GoldAssetArtwork asset={item} />
                    <div className="p-3 sm:p-4">
                      <p className="line-clamp-2 min-h-10 text-base font-bold leading-5 text-ink sm:text-lg">
                        {item.name}
                      </p>
                      <p className="mt-1 truncate text-xs font-medium text-ink-3 sm:text-sm">
                        {formatGrams(item.weightGrams)} · {item.purityLabel}
                      </p>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold sm:text-xs ${item.scope === "PERSONAL" ? "bg-blue-wash text-blue" : "bg-success-bg text-green"}`}>
                        {item.scope === "PERSONAL" ? "Pribadi" : "Bersama"}
                      </span>
                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3 sm:text-xs">
                        Taksiran nilai
                      </p>
                      <p className="mt-0.5 break-words text-base font-extrabold leading-tight tabular-nums text-ink sm:text-lg">
                        {amountsVisible ? formatIDR(item.estimatedValuationMinor) : "****"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

            </section>
          )}
        </div>
      ) : null}

      <GoldAssetModal
        open={modalOpen || editingAsset !== null}
        initialAsset={editingAsset}
        onClose={() => {
          setModalOpen(false);
          setEditingAsset(null);
        }}
        onSuccess={() => {
          setEditingAsset(null);
          void loadData();
        }}
      />
      <GoldAssetDetailModal
        asset={selectedAsset}
        amountsVisible={amountsVisible}
        deleting={selectedAsset ? deletingId === selectedAsset.id : false}
        onClose={() => setSelectedAsset(null)}
        onEdit={(asset) => {
          setSelectedAsset(null);
          setEditingAsset(asset);
        }}
        onDelete={(asset) => setAssetToDelete({ id: asset.id, name: asset.name })}
      />
      <ConfirmActionDialog
        open={assetToDelete !== null}
        title="Hapus catatan emas?"
        description={assetToDelete ? `Catatan “${assetToDelete.name}” akan dihapus dari daftar. Kamu bisa membatalkannya dalam 5 detik.` : ""}
        confirmLabel="Hapus catatan"
        busy={deletingId !== null}
        onCancel={() => setAssetToDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
