"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileDown,
  Plus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatGrams } from "@/lib/gold";
import { apiRequest } from "@/lib/api-client";
import { openPdfBlob } from "@/lib/pdf-download";
import { GoldAssetModal } from "@/components/gold/GoldAssetModal";
import { GoldAssetDetailModal } from "@/components/gold/GoldAssetDetailModal";
import { getGoldBrandLabel, getJewelryTypeLabel, GoldAssetArtwork } from "@/components/gold/GoldAssetArtwork";
import { GoldAssetIcon } from "@/components/gold/GoldAssetIcon";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { GoldAssetType, JewelryType } from "@/lib/generated/prisma/enums";
import { JEWELRY_TYPE_OPTIONS } from "@/components/gold/goldAssetIcons";
import type { GoldPortfolioSummaryDTO } from "@/types/gold";

type GoldFilter = "ALL" | GoldAssetType | JewelryType;

export function GoldPageView() {
  const router = useRouter();
  const [data, setData] = useState<GoldPortfolioSummaryDTO | null>(null);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<GoldPortfolioSummaryDTO["assets"][number] | null>(null);
  const [editingAsset, setEditingAsset] = useState<GoldPortfolioSummaryDTO["assets"][number] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [undoItem, setUndoItem] = useState<{ id: string; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<GoldFilter>("ALL");

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
    /* Initial portfolio fetch; loadData owns its loading/error state. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleDownloadReport() {
    if (!data || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const { createGoldReportPdf } = await import("./gold-report-pdf");
      const { blob, filename } = createGoldReportPdf(data);
      await openPdfBlob(blob, filename);
    } catch {
      setExportError("Laporan emas belum bisa dibuat. Coba lagi.");
    } finally {
      setExporting(false);
    }
  }

  const antamPrice = data?.priceInfo?.prices?.find((p) => p.brand === "ANTAM");
  const ubsPrice = data?.priceInfo?.prices?.find((p) => p.brand === "UBS");
  const priceSourceDate = data?.priceInfo?.prices?.[0]?.sourceDate;
  const priceDateLabel = priceSourceDate
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(new Date(`${priceSourceDate}T12:00:00+07:00`))
    : null;

  const normalizedQuery = query.trim().toLowerCase();
  const visibleAssets = (data?.assets ?? []).filter((asset) => {
    if (typeFilter === GoldAssetType.BULLION && asset.type !== GoldAssetType.BULLION) return false;
    if (typeFilter === GoldAssetType.JEWELRY && asset.type !== GoldAssetType.JEWELRY) return false;
    if (
      Object.values(JewelryType).includes(typeFilter as JewelryType) &&
      (asset.type !== GoldAssetType.JEWELRY || asset.jewelryType !== typeFilter)
    ) {
      return false;
    }
    if (!normalizedQuery) return true;
    return [
      asset.name,
      getGoldBrandLabel(asset),
      getJewelryTypeLabel(asset.jewelryType),
      asset.type === "BULLION" ? "batangan logam mulia" : "perhiasan",
      asset.purityLabel,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const hasAssetFilters = Boolean(normalizedQuery) || typeFilter !== "ALL";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Tabungan Emas"
        description="Logam mulia batangan dan emas perhiasan keluarga"
        leading={
          <Link
            href="/home"
            aria-label="Kembali ke Beranda"
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-card-border bg-card text-green shadow-xs hover:bg-mint md:flex"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
        beforeTitle={
          <Link
            href="/home"
            className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-green hover:bg-mint md:hidden"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke Beranda
          </Link>
        }
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-green px-4 text-sm font-semibold text-white shadow-xs hover:bg-brand-green-hover sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tambah Emas
          </button>
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

      {/* Loading State */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-green border-t-transparent" />
        </div>
      ) : error ? (
        /* Error State */
        <div className="rounded-3xl border border-card-border bg-card p-8 text-center shadow-bento">
          <p className="text-sm font-semibold text-danger">{error}</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-green px-4 text-sm font-semibold text-white hover:bg-brand-green-hover"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Coba lagi
            </button>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-5">
          {/* Portfolio Summary Card */}
          <div className="relative overflow-hidden rounded-feature surface-hero p-5 text-white shadow-bento sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">
                Total portofolio emas
              </p>
              <button
                type="button"
                onClick={() => setAmountsVisible((visible) => !visible)}
                aria-label={amountsVisible ? "Sembunyikan nominal" : "Tampilkan nominal"}
                aria-pressed={amountsVisible}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {amountsVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-[clamp(1.6rem,7vw,2.5rem)] font-bold leading-none tracking-tight tabular-nums">
                  {amountsVisible ? formatIDR(data.totalEstimatedValueMinor) : "••••••"}
                </p>
                <p className="mt-2 text-xs text-white/85">
                  Taksiran nilai pasar · Modal beli:{" "}
                  <span className="font-semibold tabular-nums text-white">
                    {amountsVisible ? formatIDR(data.totalCostBasisMinor) : "••••"}
                  </span>
                </p>
              </div>

              {data.totalCostBasisMinor > 0 ? (
                <div className="flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold sm:self-auto">
                  {data.totalUnrealizedPnLMinor >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  <span className="tabular-nums">
                    {amountsVisible
                      ? `${data.totalUnrealizedPnLMinor >= 0 ? "+" : ""}${formatIDR(data.totalUnrealizedPnLMinor)} (${data.totalUnrealizedPnLMinor >= 0 ? "+" : ""}${data.totalUnrealizedPnLPercent}%)`
                      : "••••"}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-xl bg-white/15 px-3 py-1 font-semibold text-white">
                Total: {formatGrams(data.totalWeightGrams)}
              </span>
              <span className="rounded-xl bg-white/10 px-3 py-1 text-white/85">
                Batangan: {formatGrams(data.bullionWeightGrams)}
              </span>
              <span className="rounded-xl bg-white/10 px-3 py-1 text-white/85">
                Perhiasan: {formatGrams(data.jewelryWeightGrams)}
              </span>
              <span className="rounded-xl bg-white/10 px-3 py-1 text-white/85">
                {data.itemCount} item
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/15 pt-3 text-[11px] text-white/85">
              <span>
                Antam buyback{" "}
                <strong className="font-semibold tabular-nums text-white">
                  {antamPrice ? (amountsVisible ? formatIDR(antamPrice.buybackPriceMinor) : "••••") : "belum tersedia"}
                </strong>
                {antamPrice ? "/gr" : ""}
              </span>
              <span>
                UBS buyback{" "}
                <strong className="font-semibold tabular-nums text-white">
                  {ubsPrice ? (amountsVisible ? formatIDR(ubsPrice.buybackPriceMinor) : "••••") : "belum tersedia"}
                </strong>
                {ubsPrice ? "/gr" : ""}
              </span>
              {data.priceInfo.isStale ? (
                <span className="inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-semibold text-warning">
                  Data {priceDateLabel ?? "lama"}
                </span>
              ) : priceDateLabel ? (
                <span className="text-white/60">Diperbarui {priceDateLabel}</span>
              ) : null}
            </div>
            <p className="mt-1 text-[10px] text-white/60">
              Estimasi harga buyback, bukan harga jual final.
            </p>

            <button
              type="button"
              onClick={() => void handleDownloadReport()}
              disabled={exporting || data.assets.length === 0}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              {exporting ? "Menyiapkan laporan..." : "Unduh laporan"}
            </button>
          </div>
          {exportError ? (
            <p role="status" className="text-xs text-danger">{exportError}</p>
          ) : null}

          {data.assets.length > 0 ? (
            <div className="space-y-2">
              <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-input-border bg-card px-3 focus-within:border-green focus-within:ring-4 focus-within:ring-green/15">
                <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
                <span className="sr-only">Cari aset emas</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari nama atau jenis perhiasan..."
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-placeholder"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Hapus pencarian"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-subtle hover:text-ink"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <div className="rounded-2xl border border-card-border bg-card p-3 shadow-bento sm:p-4">
                <div role="group" aria-label="Filter kategori emas" className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={typeFilter === "ALL"}
                  onClick={() => setTypeFilter("ALL")}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                    typeFilter === "ALL"
                      ? "border-green bg-mint text-green"
                      : "border-card-border bg-card text-ink-2 hover:bg-surface-subtle"
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  aria-pressed={typeFilter === GoldAssetType.BULLION}
                  onClick={() => setTypeFilter(GoldAssetType.BULLION)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                    typeFilter === GoldAssetType.BULLION
                      ? "border-green bg-mint text-green"
                      : "border-card-border bg-card text-ink-2 hover:bg-surface-subtle"
                  }`}
                >
                  <GoldAssetIcon type={GoldAssetType.BULLION} size="sm" className="h-7 w-7 rounded-lg bg-transparent shadow-none" />
                  Batangan
                </button>
                <button
                  type="button"
                  aria-pressed={typeFilter === GoldAssetType.JEWELRY}
                  onClick={() => setTypeFilter(GoldAssetType.JEWELRY)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                    typeFilter === GoldAssetType.JEWELRY
                      ? "border-green bg-mint text-green"
                      : "border-card-border bg-card text-ink-2 hover:bg-surface-subtle"
                  }`}
                >
                  <GoldAssetIcon type={GoldAssetType.JEWELRY} size="sm" className="h-7 w-7 rounded-lg bg-transparent shadow-none" />
                  Perhiasan
                </button>
                {JEWELRY_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={typeFilter === option.value}
                    onClick={() => setTypeFilter(option.value)}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                      typeFilter === option.value
                        ? "border-green bg-mint text-green"
                        : "border-card-border bg-card text-ink-2 hover:bg-surface-subtle"
                    }`}
                  >
                    <GoldAssetIcon
                      type={GoldAssetType.JEWELRY}
                      jewelryType={option.value}
                      size="sm"
                      className="h-7 w-7 rounded-lg bg-transparent shadow-none"
                    />
                    {option.label}
                  </button>
                ))}
                </div>
                {hasAssetFilters ? (
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                    <span>
                      Menampilkan {visibleAssets.length} dari {data.assets.length} aset.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setTypeFilter("ALL");
                      }}
                      className="min-h-9 rounded-full px-2 font-semibold text-green hover:bg-mint"
                    >
                      Reset
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Asset List */}
          {data.assets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-card-border bg-surface-subtle p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mint text-green">
                <GoldAssetIcon type="BULLION" size="lg" className="h-14 w-14 rounded-full" />
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
          ) : visibleAssets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-card-border bg-surface-subtle p-10 text-center">
              <p className="font-semibold text-ink">Tidak ada aset yang cocok</p>
              <p className="mt-1 text-xs text-ink-3">
                Coba kata kunci lain atau reset filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTypeFilter("ALL");
                }}
                className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand-green px-4 text-sm font-semibold text-white hover:bg-brand-green-hover"
              >
                Reset filter
              </button>
            </div>
          ) : (
            <section aria-labelledby="gold-asset-list-title">
              <h2
                id="gold-asset-list-title"
                className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-2"
              >
                Daftar Aset ({visibleAssets.length})
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleAssets.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedAsset(item)}
                    aria-label={`Lihat detail ${item.name}`}
                    className="group min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-card-border bg-card text-sm shadow-xs transition hover:-translate-y-0.5 hover:border-green hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
                  >
                    <GoldAssetArtwork asset={item} />
                    <div className="p-3 sm:p-4">
                      <p className="line-clamp-2 min-h-10 text-base font-bold leading-5 text-ink sm:text-lg">
                        {item.name}
                      </p>
                      <p className="mt-1 truncate text-xs font-medium text-ink-3 sm:text-sm">
                        {formatGrams(item.weightGrams)} · {item.purityLabel}
                      </p>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold sm:text-xs ${item.scope === "PERSONAL" ? "bg-surface-subtle text-ink-2" : "bg-mint text-green"}`}>
                        {item.scope === "PERSONAL" ? "Pribadi" : "Bersama"}
                      </span>
                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3 sm:text-xs">
                        Taksiran nilai
                      </p>
                      <p className="mt-0.5 break-words text-base font-extrabold leading-tight tabular-nums text-ink sm:text-lg">
                        {amountsVisible ? formatIDR(item.estimatedValuationMinor) : "••••"}
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
