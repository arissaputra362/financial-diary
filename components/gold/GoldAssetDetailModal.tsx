"use client";

import { useEffect } from "react";
import { ImageIcon, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { formatGrams } from "@/lib/gold";
import { formatIDR } from "@/lib/format";
import { getGoldBrandLabel, GoldAssetArtwork } from "@/components/gold/GoldAssetArtwork";
import type { GoldAssetDTO } from "@/types/gold";

interface GoldAssetDetailModalProps {
  asset: GoldAssetDTO | null;
  deleting: boolean;
  onClose: () => void;
  onEdit: (asset: GoldAssetDTO) => void;
  onDelete: (asset: GoldAssetDTO) => void;
}

export function GoldAssetDetailModal({ asset, deleting, onClose, onEdit, onDelete }: GoldAssetDetailModalProps) {
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (!asset) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (scanOpen) setScanOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [asset, onClose, scanOpen]);

  if (!asset) return null;

  const rows = [
    ["Jenis", asset.type === "BULLION" ? "Logam mulia batangan" : "Perhiasan"],
    ["Berat", formatGrams(asset.weightGrams)],
    ["Kadar", asset.purityLabel],
    ["Kepemilikan", asset.scope === "PERSONAL" ? "Pribadi" : "Bersama"],
    ["Tanggal beli", asset.purchaseDate],
    ...(asset.serialNumber ? [["Nomor seri", asset.serialNumber]] : []),
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#10243B]/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="gold-detail-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="relative">
          <GoldAssetArtwork asset={asset} size="detail" />
          <button type="button" onClick={onClose} aria-label="Tutup detail" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#46597A] shadow-sm hover:bg-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="gold-detail-title" className="text-xl font-extrabold text-[#17304F]">{asset.name}</h2>
              <p className="mt-1 text-sm text-[#5C7191]">{getGoldBrandLabel(asset)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${asset.scope === "PERSONAL" ? "bg-[#EFF4FA] text-[#1D4F87]" : "bg-[#F0FDF4] text-[#166534]"}`}>
              {asset.scope === "PERSONAL" ? "Pribadi" : "Bersama"}
            </span>
          </div>

          <div className="mt-5 rounded-2xl bg-[#F4F7FB] p-4">
            <p className="text-xs font-medium text-[#5C7191]">Taksiran nilai saat ini</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#17304F]">{formatIDR(asset.estimatedValuationMinor)}</p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${asset.unrealizedPnLMinor >= 0 ? "text-[#166534]" : "text-[#B91C1C]"}`}>
              {asset.unrealizedPnLMinor >= 0 ? "+" : ""}{formatIDR(asset.unrealizedPnLMinor)} ({asset.unrealizedPnLPercent}%) dari modal beli
            </p>
          </div>

          <dl className="mt-4 divide-y divide-[#EAEEF4] rounded-2xl border border-[#EAEEF4] px-4">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-[#7185A0]">{label}</dt>
                <dd className="text-right font-semibold text-[#17304F]">{value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-[#7185A0]">Modal beli</dt>
              <dd className="text-right font-semibold tabular-nums text-[#17304F]">{formatIDR(asset.buyPriceMinor)}</dd>
            </div>
          </dl>

          {asset.receiptId ? (
            <div className="mt-4">
              <button
                type="button"
                aria-expanded={scanOpen}
                onClick={() => setScanOpen((open) => !open)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#BFD3E8] text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA]"
              >
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                {scanOpen ? "Tutup hasil scan" : "Lihat hasil scan"}
              </button>
              {scanOpen ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-[#D8E2EE] bg-[#F4F7FB] p-2">
                  <img
                    src={`/api/gold/assets/${asset.id}/image`}
                    alt={`Foto hasil pindai untuk ${asset.name}`}
                    className="mx-auto max-h-[55dvh] w-full rounded-xl object-contain"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {asset.notes ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#5C7191]">{asset.notes}</p> : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => onEdit(asset)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#BFD3E8] text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA] disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDelete(asset)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {deleting ? "Menghapus..." : "Hapus"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
