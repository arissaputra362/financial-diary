"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, RefreshCw, SlidersHorizontal, Wallet } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatDateLabel } from "@/lib/dates";
import { formatIDR, formatSignedIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDTO, TransactionListDTO, WalletCardDTO } from "@/types/api";
import { categoryEmoji, categoryLabel, categoryTone, isTransferLeg } from "@/components/transactions/categories";

type Kind = "all" | "in" | "out" | "ocr";

const FILTERS: Array<{ kind: Kind; label: string }> = [
  { kind: "all", label: "Semua" },
  { kind: "in", label: "Uang masuk" },
  { kind: "out", label: "Uang keluar" },
  { kind: "ocr", label: "Struk hasil scan" },
];

export interface RecentActivityCardProps {
  initialRows: TransactionDTO[];
  wallets?: WalletCardDTO[];
}

/**
 * Recent activity with local type/source/date filters (AC-F2-6, AC-F2-7).
 * Filters only ever change this list: they call `GET /api/transactions`, never
 * the balance/budget/chart cards. Every filter change either changes the rows or
 * shows a clear filtered-empty state, and from > to is rejected before any call.
 */
export function RecentActivityCard({ initialRows, wallets = [] }: RecentActivityCardProps) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("all");
  const [walletId, setWalletId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fetchedRows, setFetchedRows] = useState<TransactionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const filtersActive = kind !== "all" || Boolean(walletId) || Boolean(from) || Boolean(to);
  const dateFiltersActive = Boolean(from) || Boolean(to);
  const [showDateFilters, setShowDateFilters] = useState(dateFiltersActive);
  const dateInvalid = Boolean(from && to && from > to);
  const rows = filtersActive ? fetchedRows : initialRows;
  const shownError = dateInvalid ? "Tanggal 'dari' harus sebelum 'sampai'." : error;

  useEffect(() => {
    if (!filtersActive || dateInvalid) return;
    let active = true;
    const params = new URLSearchParams({ limit: "5" });
    if (kind === "in") params.set("type", "MONEY_IN");
    if (kind === "out") params.set("type", "MONEY_OUT");
    if (kind === "ocr") params.set("source", "OCR");
    if (walletId) params.set("walletId", walletId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    apiRequest<TransactionListDTO>(`/api/transactions?${params.toString()}`)
      .then((response) => {
        if (!active) return;
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (!response.ok) {
          setFetchedRows([]);
          setError(response.data?.error?.message ?? "Aktivitas belum bisa dimuat.");
          return;
        }
        setFetchedRows(response.data?.rows ?? []);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setFetchedRows([]);
        setError("Aktivitas belum bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filtersActive, dateInvalid, kind, walletId, from, to, reloadToken, router]);

  const selectKind = (next: Kind) => {
    setError(null);
    setLoading(next !== "all" || Boolean(walletId) || Boolean(from) || Boolean(to));
    setKind(next);
  };

  const selectWallet = (next: string) => {
    setError(null);
    setLoading(Boolean(next) || kind !== "all" || Boolean(from) || Boolean(to));
    setWalletId(next);
  };

  const changeFrom = (value: string) => {
    setError(null);
    setLoading(Boolean(value) || Boolean(to) || kind !== "all" || Boolean(walletId));
    setFrom(value);
  };

  const changeTo = (value: string) => {
    setError(null);
    setLoading(Boolean(value) || Boolean(from) || kind !== "all" || Boolean(walletId));
    setTo(value);
  };

  const reset = () => {
    setError(null);
    setLoading(false);
    setKind("all");
    setWalletId("");
    setFrom("");
    setTo("");
    setShowDateFilters(false);
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    setReloadToken((token) => token + 1);
  };

  return (
    <section
      aria-labelledby="activity-title"
      className="rounded-3xl border border-[#D8E2EE] bg-white p-4 shadow-bento sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="activity-title" className="text-lg font-semibold text-[#17304F]">
          Aktivitas terbaru
        </h2>
        <Link
          href="/transactions"
          className="inline-flex min-h-11 items-center rounded-full border border-[#BFD3E8] bg-white px-4 text-sm font-semibold text-[#1D4F87] transition-colors hover:bg-[#EFF4FA]"
        >
          Lihat semua aktivitas
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-[#D8E2EE] bg-[#F8FAFC] p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#1D4F87]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#17304F]">Filter aktivitas</p>
          {filtersActive ? (
            <span className="rounded-full bg-[#DCEBFA] px-2.5 py-1 text-[11px] font-semibold text-[#1D4F87]">
              Aktif
            </span>
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#5C7191]">
            Jenis transaksi
          </p>
          <div
            className="grid grid-cols-2 gap-1 rounded-2xl bg-[#EFF4FA] p-1 sm:flex"
            role="group"
            aria-label="Jenis transaksi"
          >
            {FILTERS.map((filter) => (
              <button
                key={filter.kind}
                type="button"
                aria-pressed={kind === filter.kind}
                onClick={() => selectKind(filter.kind)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-xs font-semibold transition-colors sm:px-4",
                  kind === filter.kind
                    ? "bg-white text-[#17304F] shadow-sm"
                    : "text-[#46597A] hover:text-[#17304F]",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {wallets.length > 0 ? (
            <label className="mt-3 flex min-h-11 items-center gap-3 rounded-2xl border border-[#C9D6E4] bg-white px-3 text-sm font-semibold text-[#46597A]">
              <Wallet className="h-4 w-4 shrink-0 text-[#1D4F87]" aria-hidden="true" />
              <span className="sr-only">Dompet</span>
              <select
                value={walletId}
                onChange={(event) => selectWallet(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#17304F] outline-none"
                aria-label="Filter berdasarkan dompet"
              >
                <option value="">Semua dompet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} · {wallet.scope === "SHARING" ? "Bersama" : "Pribadi"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-3 border-t border-[#D8E2EE] pt-3">
            <button
              type="button"
              aria-expanded={showDateFilters}
              onClick={() => setShowDateFilters((visible) => !visible)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left text-sm font-semibold text-[#17304F]"
            >
              <span>
                Rentang tanggal <span className="font-normal text-[#5C7191]">(opsional)</span>
              </span>
              <span className="flex items-center gap-2 text-xs font-medium text-[#5C7191]">
                {dateFiltersActive ? "Dipilih" : "Pilih tanggal"}
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", showDateFilters && "rotate-180")}
                  aria-hidden="true"
                />
              </span>
            </button>

            {showDateFilters ? (
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-[#46597A]">
                  Dari tanggal
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => changeFrom(event.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-[#C9D6E4] bg-white px-3 text-sm text-[#17304F] accent-[#1D4F87] focus:border-[#1D4F87] focus:outline-none focus:ring-4 focus:ring-[#1D4F87]/15"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-[#46597A]">
                  Sampai tanggal
                  <input
                    type="date"
                    value={to}
                    onChange={(event) => changeTo(event.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-[#C9D6E4] bg-white px-3 text-sm text-[#17304F] accent-[#1D4F87] focus:border-[#1D4F87] focus:outline-none focus:ring-4 focus:ring-[#1D4F87]/15"
                  />
                </label>
              </div>
            ) : null}
          </div>

          {filtersActive ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#D8E2EE] pt-3">
              <p className="text-xs text-[#5C7191]">
                Menampilkan:{" "}
                <span className="font-semibold text-[#46597A]">
                  {FILTERS.find((filter) => filter.kind === kind)?.label}
                </span>
                {dateFiltersActive ? " dengan rentang tanggal" : ""}
              </p>
              <button
                type="button"
                onClick={reset}
                className="min-h-11 rounded-full px-3 text-xs font-semibold text-[#1D4F87] underline underline-offset-2 hover:text-[#17304F]"
              >
                Hapus semua filter
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        {shownError ? (
          <div className="rounded-2xl border border-[#F3C2C2] bg-[#FDECEC] p-4 text-sm text-[#B91C1C]">
            <p>{shownError}</p>
            {dateInvalid ? (
              <button
                type="button"
                onClick={reset}
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#166534] px-4 text-sm font-semibold text-white hover:bg-[#155C30]"
              >
                Reset filter
              </button>
            ) : (
              <button
                type="button"
                onClick={retry}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#166534] px-4 text-sm font-semibold text-white hover:bg-[#155C30]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Coba lagi
              </button>
            )}
          </div>
        ) : loading ? (
          <ul className="space-y-3" aria-busy="true" aria-label="Memuat aktivitas">
            {[0, 1, 2].map((key) => (
              <li key={key} className="h-14 animate-pulse rounded-2xl bg-[#E5EDF5] motion-reduce:animate-none" />
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-[#EFF4FA] p-6 text-center">
            <p className="text-[15px] font-semibold text-[#17304F]">
              {filtersActive ? "Tidak ada aktivitas yang cocok" : "Belum ada aktivitas"}
            </p>
            <p className="mt-1 text-sm text-[#46597A]">
              {filtersActive
                ? "Coba ubah atau reset filter untuk melihat aktivitas lain."
                : "Transaksi yang kamu catat akan muncul di sini."}
            </p>
            <div className="mt-3">
              {filtersActive ? (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex min-h-11 items-center rounded-full border border-[#BFD3E8] bg-white px-4 text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA]"
                >
                  Reset filter
                </button>
              ) : (
                <Link
                  href="/transactions?add=1"
                  className="inline-flex min-h-11 items-center rounded-full bg-[#166534] px-4 text-sm font-semibold text-white hover:bg-[#155C30]"
                >
                  Tambah transaksi
                </Link>
              )}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[#EAEEF4]">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg",
                    isTransferLeg(row) ? "bg-[#EFF4FA] text-[#1D4F87]" : categoryTone(row.category),
                  )}
                >
                  {categoryEmoji(row.category)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-[#17304F]">{rowTitle(row)}</p>
                  <p className="mt-0.5 truncate text-xs text-[#5C7191]">
                    {row.source === "OCR" ? "Hasil scan" : "Manual"} · {formatDateLabel(row.occurredAt)}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 whitespace-nowrap text-sm font-bold tabular-nums",
                    isTransferLeg(row)
                      ? "text-[#17304F]"
                      : row.type === "MONEY_IN"
                        ? "text-[#166534]"
                        : "text-[#17304F]",
                  )}
                >
                  {isTransferLeg(row)
                    ? formatIDR(row.amountMinor)
                    : formatSignedIDR(row.type === "MONEY_IN" ? row.amountMinor : -row.amountMinor)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function rowTitle(row: TransactionDTO): string {
  if (isTransferLeg(row)) return "Transfer antar dompet";
  return row.merchant ?? row.note ?? categoryLabel(row.category);
}
