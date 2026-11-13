"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Eye, EyeOff, Wallet } from "lucide-react";
import { formatIDR } from "@/lib/format";
import type { WalletCardDTO } from "@/types/api";

interface BalanceHeroProps {
  sharedBalanceMinor: number;
  personalBalanceMinor: number;
  wallets: WalletCardDTO[];
}

/**
 * The household balance is the hero because it is the number a family checks
 * first. Personal money stays visible as its own amount and is never added to
 * the shared total (A-44); the two scopes remain independent.
 */
export function BalanceHero({
  sharedBalanceMinor,
  personalBalanceMinor,
  wallets,
}: BalanceHeroProps) {
  const [visible, setVisible] = useState(true);
  const sharedCount = wallets.filter((wallet) => wallet.scope === "SHARING").length;
  const personalCount = wallets.filter((wallet) => wallet.scope === "PERSONAL").length;

  return (
    <section
      aria-label="Saldo bersama"
      className="relative h-full overflow-hidden rounded-feature surface-hero p-5 text-white shadow-bento sm:p-6"
    >
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
              Saldo bersama
            </p>
            <p className="financial-value mt-1.5 text-[clamp(1.75rem,7.5vw,2.6rem)] font-bold leading-none tracking-tight">
              {visible ? formatIDR(sharedBalanceMinor) : "••••••"}
            </p>
            <p className="mt-1.5 text-xs text-white/90">
              Termasuk dompet yang diarsipkan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Sembunyikan nominal saldo" : "Tampilkan nominal saldo"}
            aria-pressed={visible}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {visible ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Link
            href="/wallet"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/20 px-3 text-xs font-semibold text-white transition-colors hover:bg-black/30"
          >
            <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-white/90">Pribadi</span>
            <span className="financial-value text-sm font-bold">
              {visible ? formatIDR(personalBalanceMinor) : "••••"}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/90" aria-hidden="true" />
          </Link>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/20 px-3 text-[11px] font-medium text-white/90">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden="true" />
            {sharedCount} dompet bersama, {personalCount} pribadi
          </span>
        </div>
      </div>
    </section>
  );
}
