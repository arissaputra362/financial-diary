"use client";

import { Archive, Plus, Wallet } from "lucide-react";
import Link from "next/link";
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
  showAllLink?: boolean;
}

/* Active wallet overview. Scope balances live in the dashboard summary card. */
export function WalletSummaryPair({
  wallets: rawWallets,
  loading,
  error,
  onReload,
  onOpenWallet,
  onManageWallet,
  onCreate,
  onOpenArchive,
  showAllLink = true,
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
        <div className="h-40 animate-pulse rounded-2xl bg-bar-track motion-reduce:animate-none" />
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
        Wallet saya
      </h2>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Wallet className="h-5 w-5 text-green" aria-hidden="true" />
          Wallet saya
        </h3>
        <div className="flex min-w-0 items-center gap-2">
          {showAllLink ? (
            <Link href="/wallet" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 text-xs font-semibold text-green hover:bg-mint sm:text-sm">
              Lihat semua
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-mint px-3 text-xs font-semibold text-green transition-colors hover:bg-success-bg sm:text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Buat wallet
          </button>
          <button
            type="button"
            onClick={onOpenArchive}
            aria-label="Lihat dompet arsip"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-card-border bg-card text-ink-2 transition-colors hover:bg-mint hover:text-ink"
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
          </button>
          {wallets.length > 0 ? (
          <span className="whitespace-nowrap text-xs font-medium text-ink-3 sm:text-sm">
            {wallets.length} dompet aktif
          </span>
          ) : null}
        </div>
      </div>

      {wallets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-card-border bg-card p-6 text-center">
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
        <>
          <div
            role="region"
            aria-label="Daftar wallet"
            tabIndex={0}
            className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
          >
            {wallets.map((wallet) => (
              <div key={wallet.id} className="flex w-[85%] shrink-0 snap-start flex-col sm:w-auto sm:min-w-0">
                <WalletCard wallet={wallet} onOpen={onOpenWallet} onManage={onManageWallet} />
              </div>
            ))}
          </div>
          {wallets.length > 1 ? (
            <p className="text-xs text-ink-3 sm:hidden">Geser untuk melihat wallet lain.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
