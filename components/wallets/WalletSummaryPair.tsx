"use client";

import { Plus, Wallet } from "lucide-react";
import type { WalletCardDTO } from "@/types/api";
import { WalletCard } from "./WalletCard";

export interface WalletSummaryPairProps {
  wallets: WalletCardDTO[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onOpenWallet: (wallet: WalletCardDTO) => void;
  onManageWallet: (wallet: WalletCardDTO) => void;
  onCreate: () => void;
  onOpenArchive: () => void;
}

/* Active-wallet carousel. Scope balances live in the dashboard summary card. */
export function WalletSummaryPair({
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
  if (loading) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Memuat dompet">
        <div className="h-40 animate-pulse rounded-3xl bg-bar-track motion-reduce:animate-none" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-danger-border bg-danger-bg p-5 text-center">
        <p className="text-sm font-semibold text-danger">{error}</p>
        <button
          type="button"
          onClick={onReload}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-hover"
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

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1">
        <h3 className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-semibold text-ink">
          <Wallet className="h-5 w-5 text-blue" aria-hidden="true" />
          Dompetmu
        </h3>
        <div className="flex w-full min-w-0 items-center justify-between gap-1 sm:w-auto sm:flex-none sm:justify-start sm:gap-2">
          <button
            type="button"
            onClick={onOpenArchive}
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-2 text-xs font-semibold text-ink-2 underline underline-offset-2 hover:text-ink sm:px-3"
          >
            Dompet arsip
          </button>
          {wallets.length > 0 ? (
          <span className="whitespace-nowrap rounded-full bg-chip-slate px-2 py-1 text-xs font-semibold text-ink-2 sm:px-3">
            {wallets.length} dompet aktif
          </span>
          ) : null}
        </div>
      </div>

      {wallets.length === 0 ? (
        <div className="rounded-3xl border border-card-border bg-card p-6 text-center shadow-bento">
          <p className="text-[15px] font-semibold text-ink">Belum ada dompet.</p>
          <p className="mt-1 text-sm text-ink-2">Simpan uang ke tempat yang tepat.</p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-hover"
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
            className="flex min-h-40 w-[min(100%,24rem)] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-green bg-card p-5 text-sm font-semibold text-green transition-colors hover:bg-blue-wash md:w-72"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-mint"
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
