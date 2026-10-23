"use client";

import { useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WalletDTO } from "@/types/api";
import { ScopePill, WalletMark } from "./scope";
import { useWallets } from "./useWallets";

export interface WalletPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (wallet: WalletDTO) => void;
  /** Opens the create-wallet form from inside the picker (design 06 §7.1). */
  onCreate: () => void;
  /**
   * Wallet currently bound to the field that opened the picker. The picker is
   * a single-choice list: the bound wallet is the selected option, and the
   * caller keeps that state (the picker never invents its own answer).
   */
  selectedWalletId?: string | null;
}

/** Grouped picker (design 06 §7.1): BERSAMA then PRIBADI, alphabetical. */
export function WalletPickerSheet({
  open,
  onClose,
  onSelect,
  onCreate,
  selectedWalletId = null,
}: WalletPickerSheetProps) {
  const { wallets, loading, error, reload } = useWallets("active");
  const panelRef = useRef<HTMLDivElement>(null);
  /*
    Roving focus: only the selected (or first) option is tabbable, then the
    arrow keys move between options, which is what a listbox expects.

    The session is scoped to one opening (`open`) and to the field's current
    selection, so a session from a previous opening is ignored instead of
    leaving a stale option tabbable.
  */
  const [session, setSession] = useState<{
    open: boolean;
    selection: string | null;
    focusedId: string | null;
  } | null>(null);

  useDialogFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  const shared = wallets.filter((wallet) => wallet.scope === "SHARING");
  const personal = wallets.filter((wallet) => wallet.scope === "PERSONAL");
  const groups: Array<{ title: string; wallets: WalletDTO[] }> = [
    { title: "Bersama (semua anggota bisa lihat)", wallets: shared },
    { title: "Pribadi (hanya kamu)", wallets: personal },
  ];

  /* The option that is tabbable on entry: the field's wallet, else the first. */
  const selectedVisible =
    selectedWalletId !== null && wallets.some((wallet) => wallet.id === selectedWalletId);
  const entryId = (selectedVisible ? selectedWalletId : null) ?? wallets[0]?.id ?? null;
  const focusedId =
    session && session.open === open && session.selection === selectedWalletId ? session.focusedId : null;
  const tabbableId = focusedId ?? entryId;

  const moveFocus = (walletId: string) => {
    setSession({ open, selection: selectedWalletId, focusedId: walletId });
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-wallet-option="${walletId}"]`);
    node?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#14273F]/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="wallet-picker-title"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#D8E2EE] bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="wallet-picker-title" className="text-lg font-semibold tracking-tight text-[#17304F]">
            Pilih dompet
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

        {loading ? (
          <div className="mt-4 space-y-3" aria-busy="true" aria-label="Memuat dompet">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : error ? (
          <div className="mt-4 rounded-2xl bg-[#FDECEC] px-4 py-3 text-center">
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
          <div className="mt-4 rounded-2xl bg-[#EFF4FA] px-4 py-5 text-center">
            <p className="text-sm text-[#46597A]">
              Kamu belum punya dompet. Buat dompet agar uang tersimpan ke tempat yang tepat.
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#166534] px-5 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Buat dompet baru
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map((group) => (
              <WalletGroup
                key={group.title}
                title={group.title}
                wallets={group.wallets}
                selectedWalletId={selectedWalletId}
                tabbableId={tabbableId}
                onFocusOption={moveFocus}
                onSelect={(wallet) => {
                  onSelect(wallet);
                  onClose();
                }}
              />
            ))}
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#BFD3E8] bg-white px-5 text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Buat dompet baru
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WalletGroup({
  title,
  wallets,
  selectedWalletId,
  tabbableId,
  onFocusOption,
  onSelect,
}: {
  title: string;
  wallets: WalletDTO[];
  selectedWalletId: string | null;
  tabbableId: string | null;
  onFocusOption: (walletId: string) => void;
  onSelect: (wallet: WalletDTO) => void;
}) {
  if (wallets.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5C7191]">{title}</h3>
      <ul
        role="listbox"
        aria-label={title}
        className="mt-2 space-y-1"
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const index = wallets.findIndex((wallet) => wallet.id === tabbableId);
          const next =
            event.key === "ArrowDown"
              ? (index + 1 + wallets.length) % wallets.length
              : (index - 1 + wallets.length) % wallets.length;
          const target = wallets[index < 0 ? 0 : next];
          if (target) onFocusOption(target.id);
        }}
      >
        {wallets.map((wallet) => {
          const selected = wallet.id === selectedWalletId;
          const focusable = wallet.id === tabbableId;
          const longBalance = formatIDR(wallet.balanceMinor).length > 13;
          return (
            /* `role="none"` keeps the option a direct child of the listbox. */
            <li key={wallet.id} role="none">
              <button
                type="button"
                role="option"
                data-wallet-option={wallet.id}
                aria-selected={selected}
                tabIndex={focusable ? 0 : -1}
                onFocus={() => onFocusOption(wallet.id)}
                onClick={() => onSelect(wallet)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left hover:bg-[#EFF4FA]",
                  selected ? "border-[#1D4F87] bg-[#EFF4FA] ring-1 ring-[#1D4F87]" : "border-[#D8E2EE]",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <WalletMark />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-medium text-[#17304F]">
                        {wallet.name}
                        {selected ? <span className="sr-only"> (dompet terpilih)</span> : null}
                      </span>
                      <ScopePill scope={wallet.scope} className="shrink-0" />
                    </span>
                    {wallet.purpose ? (
                      <span className="block truncate text-xs text-[#5C7191]">{wallet.purpose}</span>
                    ) : null}
                    {longBalance ? (
                      <span className="mt-1 block whitespace-nowrap text-sm font-semibold tabular-nums text-[#17304F] sm:hidden">
                        {formatIDR(wallet.balanceMinor)}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 items-center gap-2",
                    longBalance ? "hidden sm:flex" : "flex",
                  )}
                >
                  {selected ? <Check className="h-4 w-4 text-[#1D4F87]" aria-hidden="true" /> : null}
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[#17304F]">
                    {formatIDR(wallet.balanceMinor)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
