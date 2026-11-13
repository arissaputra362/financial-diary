"use client";

import { Landmark, MoreHorizontal } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WalletCardDTO } from "@/types/api";
import { ScopePill } from "./scope";

export interface WalletCardProps {
  wallet: WalletCardDTO;
  onOpen: (wallet: WalletCardDTO) => void;
  onManage: (wallet: WalletCardDTO) => void;
}

/* Initials only. This is a generic monogram, never a copy of a bank's logo. */
function institutionMonogram(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (cleaned.slice(0, 3) || "B").toUpperCase();
}

/**
 * Wallet overview card. The surface uses a soft brand gradient (product-owner
 * direction) with an optional institution monogram. It shows only stored wallet
 * details and server balance; the card body opens detail and `Kelola` opens the
 * existing management sheet. No card numbers, expiry, CVV, or bank logos.
 */
export function WalletCard({ wallet, onOpen, onManage }: WalletCardProps) {
  const shared = wallet.scope === "SHARING";
  const longBalance = formatIDR(wallet.balanceMinor).length > 16;
  const institutionLabel = wallet.institution ? `, ${wallet.institution.name}` : "";
  const label = `${wallet.name}${institutionLabel}, ${shared ? "Bersama" : "Pribadi"}, tersedia ${formatIDR(wallet.balanceMinor)}, buka detail`;
  const monogram = wallet.institution ? institutionMonogram(wallet.institution.name) : null;

  return (
    <div
      className={cn(
        "relative flex min-h-40 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl p-4 text-white shadow-bento",
        shared
          ? "bg-[linear-gradient(135deg,#1a8a5e_0%,#0e5a3b_52%,#0a3a26_100%)]"
          : "bg-[linear-gradient(135deg,#0f766e_0%,#115e59_52%,#0d3b37_100%)]",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-2xl"
      />

      <div className="relative flex items-center justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white" aria-hidden="true">
          {monogram ? (
            <span className="text-[11px] font-bold tracking-wide">{monogram}</span>
          ) : (
            <Landmark className="h-5 w-5" />
          )}
        </span>
        <ScopePill
          scope={wallet.scope}
          className="shrink-0 border border-white/25 bg-white/15 text-white"
        />
      </div>

      <button
        type="button"
        onClick={() => onOpen(wallet)}
        aria-label={label}
        className="relative mt-3 w-full flex-1 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="block min-w-0">
          <span className="block truncate text-base font-semibold text-white">{wallet.name}</span>
          {wallet.institution ? (
            <span className="mt-0.5 block truncate text-xs font-medium text-white/85">
              {wallet.institution.name}
            </span>
          ) : null}
          {wallet.purpose ? (
            <span className="mt-0.5 block truncate text-xs text-white/80">
              Tujuan: {wallet.purpose}
            </span>
          ) : null}
        </span>
        <span
          className={
            longBalance
              ? "mt-2 block whitespace-nowrap text-base font-semibold tabular-nums text-white"
              : "mt-2 block whitespace-nowrap text-2xl font-semibold tabular-nums text-white"
          }
        >
          {formatIDR(wallet.balanceMinor)}
        </span>
      </button>

      <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-white/20 pt-2">
        <span className="text-xs text-white/80">Saldo saat ini</span>
        <button
          type="button"
          onClick={() => onManage(wallet)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-white/90 hover:bg-white/15"
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Kelola
        </button>
      </div>
    </div>
  );
}
