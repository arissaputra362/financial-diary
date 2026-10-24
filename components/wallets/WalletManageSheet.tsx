"use client";

import { useRef, useState } from "react";
import { Archive, Plus, RotateCcw, X } from "lucide-react";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WalletDTO } from "@/types/api";
import { ScopePill, WalletMark } from "./scope";
import { useWallets } from "./useWallets";

export interface WalletManageSheetProps {
  open: boolean;
  /** Land directly on the Arsip tab when opened from the summary helper (C-27). */
  initialTab?: "active" | "archived";
  onClose: () => void;
  onEdit: (wallet: WalletDTO) => void;
  onArchive: (wallet: WalletDTO) => void;
  onRestore: (wallet: WalletDTO) => void;
  onCreate: () => void;
}

/*
  `Kelola dompet` sheet (design 06 §6.3): Aktif / Arsip tabs. Archive/restore
  options render only for wallets the actor may manage (C-4/C-22); the server
  still validates.
*/
export function WalletManageSheet({
  open,
  initialTab = "active",
  onClose,
  onEdit,
  onArchive,
  onRestore,
  onCreate,
}: WalletManageSheetProps) {
  const [tab, setTab] = useState<"active" | "archived">(initialTab);
  const { wallets, loading, error, reload } = useWallets(tab, open);
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-[#14273F]/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="wallet-manage-title"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#D8E2EE] bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="wallet-manage-title" className="text-lg font-semibold tracking-tight text-[#17304F]">
            Kelola dompet
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#46597A] hover:bg-[#EFF4FA]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex gap-1 rounded-full bg-[#EFF4FA] p-1" role="tablist" aria-label="Daftar dompet">
          {(
            [
              ["active", "Aktif"],
              ["archived", "Arsip"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                tab === value ? "bg-white text-[#17304F] shadow-sm" : "text-[#46597A]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="py-6 text-center text-sm text-[#5C7191]">Memuat dompet...</p>
          ) : error ? (
            <div className="rounded-2xl bg-[#FDECEC] px-4 py-3 text-center">
              <p className="text-sm text-[#B91C1C]">{error}</p>
              <button
                type="button"
                onClick={() => void reload()}
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#166534] px-5 text-sm font-semibold text-white"
              >
                Coba lagi
              </button>
            </div>
          ) : wallets.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#46597A]">
              {tab === "archived" ? "Belum ada dompet di Arsip." : "Belum ada dompet aktif."}
            </p>
          ) : (
            wallets.map((wallet) => (
              <div
                key={wallet.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D8E2EE] px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <WalletMark />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-medium text-[#17304F]">{wallet.name}</span>
                      <ScopePill scope={wallet.scope} className="shrink-0" />
                    </div>
                    <p className="whitespace-nowrap text-xs tabular-nums text-[#5C7191]">{formatIDR(wallet.balanceMinor)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {wallet.canEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(wallet)}
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-[#46597A] hover:bg-[#EFF4FA]"
                    >
                      Ubah
                    </button>
                  ) : null}
                  {tab === "active" && wallet.canArchive ? (
                    <button
                      type="button"
                      onClick={() => onArchive(wallet)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold text-[#B91C1C] hover:bg-[#FDECEC]"
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Arsipkan
                    </button>
                  ) : null}
                  {tab === "archived" && wallet.canRestore ? (
                    <button
                      type="button"
                      onClick={() => onRestore(wallet)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold text-[#166534] hover:bg-[#DCFCE7]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Pulihkan
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#BFD3E8] bg-white px-5 text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Buat dompet baru
        </button>
      </div>
    </div>
  );
}
