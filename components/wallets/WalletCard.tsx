"use client";

import { MoreHorizontal, Nfc } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WalletCardDTO } from "@/types/api";
import { ScopePill } from "./scope";

export interface WalletCardProps {
  wallet: WalletCardDTO;
  onOpen: (wallet: WalletCardDTO) => void;
  onManage: (wallet: WalletCardDTO) => void;
}

/**
 * Generic ATM/debit-style wallet card (design 06 §4, token from doc 01 §5.6).
 * Fixed data only: name, purpose, scope, balance, and existing actions. There
 * is no card number, expiry, CVV, cardholder name, bank/network logo, or claim
 * of bank connectivity. The whole card body opens the detail sheet; `Kelola`
 * is a separate labelled control that opens the manage sheet.
 */
export function WalletCard({ wallet, onOpen, onManage }: WalletCardProps) {
  const shared = wallet.scope === "SHARING";
  const longBalance = formatIDR(wallet.balanceMinor).length > 16;
  const institutionLabel = wallet.institution ? `, ${wallet.institution.name}` : "";
  const label = `${wallet.name}${institutionLabel}, ${shared ? "Bersama" : "Pribadi"}, tersedia ${formatIDR(wallet.balanceMinor)}, buka detail`;

  return (
    <div
      className={cn(
        "flex min-h-40 w-[min(82vw,18rem)] shrink-0 snap-start flex-col rounded-3xl p-5 text-white shadow-bento md:w-72",
        shared ? "bg-[#14273F]" : "bg-[#1D4F87]",
      )}
    >
      <div className="flex items-start justify-between" aria-hidden="true">
        <span className="flex h-6 w-9 items-center justify-center rounded-md bg-[#166534]">
          <span className="h-2.5 w-3.5 rounded-sm border border-[#DCFCE7]/70" />
        </span>
        <Nfc className="h-5 w-5 text-[#DCEBFA]/80" />
      </div>

      <button
        type="button"
        onClick={() => onOpen(wallet)}
        aria-label={label}
        className="mt-3 w-full flex-1 rounded-2xl text-left focus-visible:outline-white"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold text-white">{wallet.name}</span>
            {wallet.institution ? (
              <span className="mt-0.5 block truncate text-[11px] font-medium text-[#DCEBFA]">
                {wallet.institution.name}
              </span>
            ) : null}
            {wallet.purpose ? (
              <span className="mt-0.5 block truncate text-xs text-[#DCEBFA]">
                Tujuan: {wallet.purpose}
              </span>
            ) : null}
          </span>
          <ScopePill
            scope={wallet.scope}
            className="shrink-0 border-0 bg-white text-[#14273F]"
          />
        </span>
        <span
          className={
            longBalance
              ? "mt-4 block whitespace-nowrap text-base font-semibold tabular-nums text-white"
              : "mt-4 block whitespace-nowrap text-2xl font-semibold tabular-nums text-white"
          }
        >
          {formatIDR(wallet.balanceMinor)}
        </span>
      </button>

      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#DCEBFA]">
          Uang tersedia
        </span>
        <button
          type="button"
          onClick={() => onManage(wallet)}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#9FB9D6] px-3 text-xs font-semibold text-white hover:bg-white/10"
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Kelola
        </button>
      </div>
    </div>
  );
}
