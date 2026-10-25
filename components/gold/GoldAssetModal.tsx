"use client";

import { useState } from "react";
import { Camera, Coins, Gem, Sparkles, Upload, X } from "lucide-react";
import { GoldAssetType, GoldBrand, WalletScope } from "@/lib/generated/prisma/enums";
import { apiRequest } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import { normalizeMoneyValue, parseMoneyInputValue } from "@/lib/money-input";
import { formatGrams, parsePurityPermille } from "@/lib/gold";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { CreateGoldAssetInput, GoldScanResultDTO } from "@/types/gold";

interface GoldAssetModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function GoldAssetModal({ open, onClose, onSuccess }: GoldAssetModalProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "scan">("manual");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [type, setType] = useState<GoldAssetType>(GoldAssetType.BULLION);
  const [brand, setBrand] = useState<GoldBrand>(GoldBrand.ANTAM);
  const [name, setName] = useState("");
  const [weightGrams, setWeightGrams] = useState<string>("");
  const [purityInput, setPurityInput] = useState<string>("24K");
  const [buyPriceMinor, setBuyPriceMinor] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [scope, setScope] = useState<WalletScope>(WalletScope.PERSONAL);
  const [serialNumber, setSerialNumber] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  async function handleScanUpload(file: File) {
    setError(null);
    setScanning(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/gold/scan", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Gagal memindai foto.");
      }

      const data: GoldScanResultDTO = await res.json();

      // Populate review form with extracted data
      if (data.scanType === "JEWELRY_RECEIPT") {
        setType(GoldAssetType.JEWELRY);
      } else {
        setType(GoldAssetType.BULLION);
      }

      setBrand(data.brand || GoldBrand.ANTAM);
      setName(data.name || "");
      setWeightGrams(data.weightGrams ? String(data.weightGrams) : "");
      setPurityInput(data.purityPermille >= 990 ? "24K" : data.purityPermille >= 750 ? "18K" : "17K");
      if (data.buyPriceMinor) setBuyPriceMinor(normalizeMoneyValue(String(data.buyPriceMinor)));
      if (data.purchaseDate) setPurchaseDate(data.purchaseDate);
      if (data.serialNumber) setSerialNumber(data.serialNumber);

      // Switch to manual tab for review
      setActiveTab("manual");
    } catch (e: any) {
      setError(e.message || "Gagal memindai gambar emas.");
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const grams = parseFloat(weightGrams);
    if (isNaN(grams) || grams <= 0) {
      setError("Berat emas harus berupa angka lebih besar dari 0");
      return;
    }

    const price = parseMoneyInputValue(buyPriceMinor);
    if (isNaN(price) || price < 0) {
      setError("Harga beli tidak valid");
      return;
    }

    if (!name.trim()) {
      setError("Nama aset emas wajib diisi");
      return;
    }

    setLoading(true);

    try {
      const payload: CreateGoldAssetInput = {
        name: name.trim(),
        type,
        brand,
        scope,
        weightGrams: grams,
        purityPermille: parsePurityPermille(purityInput),
        buyPriceMinor: price,
        purchaseDate,
        serialNumber: serialNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const res = await apiRequest("/api/gold/assets", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(res.data?.error?.message || "Gagal menyimpan aset emas.");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat menyimpan aset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gold-modal-title"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#BCD6EF] bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup modal"
          className="absolute top-5 right-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#5C7191] hover:bg-[#F1F5FA] hover:text-[#17304F]"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 id="gold-modal-title" className="text-xl font-bold text-[#17304F]">
          Catat Tabungan Emas
        </h2>
        <p className="mt-1 text-sm text-[#46597A]">
          Simpan catatan logam mulia batangan atau emas perhiasan keluargamu.
        </p>

        {/* Tab switch */}
        <div className="mt-5 grid grid-cols-2 rounded-2xl bg-[#F1F5FA] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
              activeTab === "manual"
                ? "bg-white text-[#1D4F87] shadow-xs"
                : "text-[#5C7191] hover:text-[#17304F]"
            }`}
          >
            <Coins className="h-4 w-4" />
            Input Manual
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scan")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
              activeTab === "scan"
                ? "bg-white text-[#1D4F87] shadow-xs"
                : "text-[#5C7191] hover:text-[#17304F]"
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            Pindai AI
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl bg-[#FDECEC] p-3 text-sm font-medium text-[#B91C1C]">
            {error}
          </div>
        ) : null}

        {activeTab === "scan" ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#BCD6EF] bg-[#F8FAFC] p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#DCEBFA] text-[#1D4F87]">
              {scanning ? (
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#1D4F87] border-t-transparent" />
              ) : (
                <Camera className="h-8 w-8" />
              )}
            </div>
            <h3 className="mt-4 font-bold text-[#17304F]">
              {scanning ? "Memindai dengan Gemini Vision..." : "Unggah Foto Certicard / Nota Emas"}
            </h3>
            <p className="mt-1 text-xs text-[#5C7191]">
              Foto kemasan certicard (Antam/UBS) atau nota pembelian toko perhiasan fisik.
            </p>

            <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#1D4F87] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#153D6B]">
              <Upload className="h-4 w-4" />
              Pilih Foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={scanning}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleScanUpload(file);
                }}
              />
            </label>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Tipe Emas */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                Tipe Emas
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType(GoldAssetType.BULLION)}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-semibold transition ${
                    type === GoldAssetType.BULLION
                      ? "border-[#1D4F87] bg-[#DCEBFA] text-[#1D4F87]"
                      : "border-[#D8E2EE] bg-white text-[#46597A]"
                  }`}
                >
                  <Coins className="h-4 w-4" />
                  Logam Mulia (Batangan)
                </button>
                <button
                  type="button"
                  onClick={() => setType(GoldAssetType.JEWELRY)}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-semibold transition ${
                    type === GoldAssetType.JEWELRY
                      ? "border-[#1D4F87] bg-[#DCEBFA] text-[#1D4F87]"
                      : "border-[#D8E2EE] bg-white text-[#46597A]"
                  }`}
                >
                  <Gem className="h-4 w-4" />
                  Perhiasan
                </button>
              </div>
            </div>

            {/* Brand (jika Bullion) */}
            {type === GoldAssetType.BULLION ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                  Brand / Produsen
                </label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as GoldBrand)}
                  className="mt-1.5 w-full rounded-2xl border border-[#C9D6E4] bg-white p-3 text-sm font-medium text-[#17304F] focus:border-[#1D4F87] focus:outline-hidden"
                >
                  <option value={GoldBrand.ANTAM}>Antam (Logam Mulia)</option>
                  <option value={GoldBrand.UBS}>UBS Gold</option>
                  <option value={GoldBrand.GALERI_24}>Galeri 24 (Pegadaian)</option>
                  <option value={GoldBrand.LOTUS_ARCHI}>Lotus Archi</option>
                  <option value={GoldBrand.OTHER}>Brand Lainnya</option>
                </select>
              </div>
            ) : null}

            {/* Nama Aset */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                Nama Barang
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === GoldAssetType.BULLION ? "Contoh: Antam Certicard 10g" : "Contoh: Cincin Berlian 18K"}
                className="mt-1.5 w-full rounded-2xl border border-[#C9D6E4] bg-white p-3 text-sm font-medium text-[#17304F] focus:border-[#1D4F87] focus:outline-hidden"
                required
              />
            </div>

            {/* Berat & Kadar */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                  Berat (Gram)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={weightGrams}
                  onChange={(e) => setWeightGrams(e.target.value)}
                  placeholder="Misal: 5.0"
                  className="mt-1.5 w-full rounded-2xl border border-[#C9D6E4] bg-white p-3 text-sm font-medium text-[#17304F] focus:border-[#1D4F87] focus:outline-hidden"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                  Kadar Kemurnian
                </label>
                <select
                  value={purityInput}
                  onChange={(e) => setPurityInput(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[#C9D6E4] bg-white p-3 text-sm font-medium text-[#17304F] focus:border-[#1D4F87] focus:outline-hidden"
                >
                  <option value="24K">24K (99.9% - Murni)</option>
                  <option value="22K">22K (91.6%)</option>
                  <option value="18K">18K (75% / Cap 750)</option>
                  <option value="17K">17K (70% / Cap 700)</option>
                  <option value="16K">16K (65%)</option>
                  <option value="10K">10K (42%)</option>
                  <option value="9K">9K (37.5% / Cap 375)</option>
                </select>
              </div>
            </div>

            {/* Harga Beli & Tanggal */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="gold-buy-price"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]"
                >
                  Modal Beli (Rp)
                </label>
                <div className="mt-1.5 flex items-center gap-1.5 rounded-2xl border border-[#C9D6E4] bg-white px-3 py-3 focus-within:border-[#1D4F87]">
                  <span className="text-sm font-semibold text-[#46597A]">Rp</span>
                  <MoneyInput
                    id="gold-buy-price"
                    value={buyPriceMinor}
                    onValueChange={setBuyPriceMinor}
                    placeholder="7.500.000"
                    className="w-full min-w-0 bg-transparent text-sm font-medium tabular-nums text-[#17304F] outline-none placeholder:text-[#9BAFC8]"
                  />
                </div>
                {buyPriceMinor ? (
                  <p className="mt-1 text-xs text-[#5C7191]">{formatIDR(parseMoneyInputValue(buyPriceMinor))}</p>
                ) : null}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                  Tanggal Perolehan
                </label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[#C9D6E4] bg-white p-3 text-sm font-medium text-[#17304F] focus:border-[#1D4F87] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            {/* Scope (Pribadi / Bersama) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                Cakupan Tabungan
              </label>
              <div className="mt-1.5 flex gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-[#17304F]">
                  <input
                    type="radio"
                    name="scope"
                    value={WalletScope.PERSONAL}
                    checked={scope === WalletScope.PERSONAL}
                    onChange={() => setScope(WalletScope.PERSONAL)}
                    className="accent-[#1D4F87]"
                  />
                  Tabungan Pribadi
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-[#17304F]">
                  <input
                    type="radio"
                    name="scope"
                    value={WalletScope.SHARING}
                    checked={scope === WalletScope.SHARING}
                    onChange={() => setScope(WalletScope.SHARING)}
                    className="accent-[#1D4F87]"
                  />
                  Tabungan Bersama (Keluarga)
                </label>
              </div>
            </div>

            {/* Nomor Seri / Catatan */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                Nomor Seri / Catatan Tempat Simpan (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Misal: Disimpan di brankas kamar, nomor seri A12893"
                className="mt-1.5 w-full rounded-2xl border border-[#C9D6E4] bg-white p-3 text-sm font-medium text-[#17304F] focus:border-[#1D4F87] focus:outline-hidden"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#5C7191] hover:bg-[#F1F5FA]"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-[#166534] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#155C30] disabled:opacity-50"
              >
                {loading ? "Menyimpan..." : "Simpan Aset Emas"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
