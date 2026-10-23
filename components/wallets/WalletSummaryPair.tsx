"use client";

import { Plus, Users, User, Wallet } from "lucide-react";
import { formatIDR } from "@/lib/format";
import type { WalletCardDTO } from "@/types/api";
import { WalletCard } from "./WalletCard";

export interface WalletSummaryPairProps {
  sharedBalanceMinor: number;
  personalBalanceMinor: number;
  wallets: WalletCardDTO[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onOpenWallet: (wallet: WalletCardDTO) => void;
  onManageWallet: (wallet: WalletCardDTO) => void;
  onCreate: () => void;
  onOpenArchive: () => void;
}

/*
  Two separate summaries plus the active-wallet carousel (design 06 §5, C-11;
  R-9 placement). Shared and personal totals are never summed. The helper states
  that archived balances are included even though only active cards are shown
  (C-18/C-27).
*/
export function WalletSummaryPair({
  sharedBalanceMinor,
  personalBalanceMinor,
  wallets: rawWallets,
  loading,
  error,
  onReload,
  onOpenWallet,
  onManageWallet,
  onCreate,
  onOpenArchive,
}: WalletSummaryPairProps) {
  /*
    Defensive presentational guard: an older cached API response or a test stub
    may omit `wallets`. The DTO requires it, but rendering an empty carousel is
    safer than taking the whole dashboard down.
  */
  const wallets = Array.isArray(rawWallets) ? rawWallets : [];
  const totalLength = Math.max(
    formatIDR(sharedBalanceMinor).length,
    formatIDR(personalBalanceMinor).length,
  );
  const veryLongTotals = totalLength > 16;
  const longTotals = totalLength > 13;

  if (loading) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Memuat dompet">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="h-28 animate-pulse rounded-3xl bg-[#E5EDF5] motion-reduce:animate-none" />
          <div className="h-28 animate-pulse rounded-3xl bg-[#E5EDF5] motion-reduce:animate-none" />
        </div>
        <div className="h-40 animate-pulse rounded-3xl bg-[#E5EDF5] motion-reduce:animate-none" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-[#F3C2C2] bg-[#FDECEC] p-5 text-center">
        <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>
        <button
          type="button"
          onClick={onReload}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#166534] px-5 text-sm font-semibold text-white hover:bg-[#155C30]"
        >
          Coba lagi
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="wallets-title">
      <h2 id="wallets-title" className="sr-only">
        Dompet
      </h2>

      <div
        className={
          veryLongTotals
            ? "grid grid-cols-1 gap-3 sm:gap-4"
            : longTotals
              ? "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
              : "grid grid-cols-2 gap-3 sm:gap-4"
        }
      >
        <article className="min-w-0 rounded-3xl border border-[#BCD6EF] bg-[#DCEBFA] p-4 shadow-bento sm:p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#46597A]">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            Uang tersedia bersama
          </p>
          <p className="mt-2 whitespace-nowrap text-[clamp(1rem,4.4vw,1.5rem)] font-semibold tabular-nums text-[#17304F]">
            {formatIDR(sharedBalanceMinor)}
          </p>
          <button
            type="button"
            onClick={onOpenArchive}
            className="-my-1.5 inline-flex min-h-11 items-center text-xs font-medium text-[#46597A] underline underline-offset-2 hover:text-[#17304F]"
          >
            Termasuk dompet di Arsip
          </button>
        </article>

        <article className="min-w-0 rounded-3xl border border-[#D8E2EE] bg-white p-4 shadow-bento sm:p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#46597A]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EFF4FA]">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            Dompet pribadiku
          </p>
          <p className="mt-2 whitespace-nowrap text-[clamp(1rem,4.4vw,1.5rem)] font-semibold tabular-nums text-[#17304F]">
            {formatIDR(personalBalanceMinor)}
          </p>
          <button
            type="button"
            onClick={onOpenArchive}
            className="-my-1.5 inline-flex min-h-11 items-center text-xs font-medium text-[#46597A] underline underline-offset-2 hover:text-[#17304F]"
          >
            Termasuk dompet di Arsip
          </button>
        </article>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-[#17304F]">
          <Wallet className="h-5 w-5 text-[#1D4F87]" aria-hidden="true" />
          Dompetmu
        </h3>
        {wallets.length > 0 ? (
          <span className="rounded-full bg-[#E6ECF4] px-3 py-1 text-xs font-semibold text-[#46597A]">
            {wallets.length} dompet aktif
          </span>
        ) : null}
      </div>

      {wallets.length === 0 ? (
        <div className="rounded-3xl border border-[#D8E2EE] bg-white p-6 text-center shadow-bento">
          <p className="text-[15px] font-semibold text-[#17304F]">Belum ada dompet.</p>
          <p className="mt-1 text-sm text-[#46597A]">Simpan uang ke tempat yang tepat.</p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#166534] px-5 text-sm font-semibold text-white hover:bg-[#155C30]"
          >
            Buat dompet pertama
          </button>
        </div>
      ) : (
        <div
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
          role="group"
          aria-label="Kartu dompet, geser untuk melihat dompet lain"
        >
          {wallets.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              onOpen={onOpenWallet}
              onManage={onManageWallet}
            />
          ))}
          <button
            type="button"
            onClick={onCreate}
            className="flex min-h-40 w-[min(82vw,18rem)] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-[#166534] bg-white p-5 text-sm font-semibold text-[#166534] transition-colors hover:bg-[#EFF4FA] md:w-72"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCFCE7]"
            >
              <Plus className="h-5 w-5" />
            </span>
            Dompet baru
          </button>
        </div>
      )}
    </section>
  );
}
