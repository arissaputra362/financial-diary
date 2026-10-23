"use client";

import { useRef } from "react";
import { Archive, Nfc, Pencil, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WalletDTO } from "@/types/api";
import { ScopePill, scopeLabel } from "./scope";

export interface WalletDetailSheetProps {
  wallet: WalletDTO | null;
  onClose: () => void;
  onEdit: (wallet: WalletDTO) => void;
  onArchive: (wallet: WalletDTO) => void;
  onRestore: (wallet: WalletDTO) => void;
}

/*
  Wallet detail (design 06 §6.2). Scope is shown as non-editable information
  (C-31): there is no scope control here. The creator footer is shown for
  SHARING wallets only.
*/
export function WalletDetailSheet({ wallet, onClose, onEdit, onArchive, onRestore }: WalletDetailSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(wallet !== null, panelRef, onClose);

  if (!wallet) return null;

  const archived = wallet.archivedAt !== null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#14273F]/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="wallet-detail-title"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#D8E2EE] bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="wallet-detail-title" className="text-lg font-semibold tracking-tight text-[#17304F]">
            Detail dompet
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail dompet"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#46597A] hover:bg-[#EFF4FA]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div
          className={cn(
            "mt-4 rounded-2xl p-4 text-white",
            wallet.scope === "SHARING" ? "bg-[#14273F]" : "bg-[#1D4F87]",
          )}
        >
          <div className="flex items-start justify-between" aria-hidden="true">
            <span className="flex h-5 w-8 items-center justify-center rounded bg-[#166534]">
              <span className="h-2 w-3 rounded-sm border border-[#DCFCE7]/70" />
            </span>
            <Nfc className="h-4 w-4 text-[#DCEBFA]/80" />
          </div>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-lg font-semibold leading-snug text-white">{wallet.name}</p>
            <ScopePill scope={wallet.scope} className="shrink-0 border-0 bg-white text-[#14273F]" />
          </div>
          <p className="mt-2 whitespace-nowrap text-[clamp(1.25rem,5vw,1.5rem)] font-semibold tabular-nums text-white">
            {formatIDR(wallet.balanceMinor)}
          </p>
          {wallet.scope === "SHARING" && wallet.createdBy ? (
            <p className="mt-1 text-xs text-[#DCEBFA]">Ditambah oleh {wallet.createdBy.displayName}</p>
          ) : null}
        </div>

        <dl className="mt-4 divide-y divide-[#EAEEF4]">
          <Row label="Jenis">{scopeLabel(wallet.scope)}</Row>
          {wallet.purpose ? <Row label="Tujuan penggunaan">{wallet.purpose}</Row> : null}
          <Row label="Saldo awal">{formatIDR(wallet.openingBalanceMinor)}</Row>
          {wallet.institution ? (
            <Row label="Bank atau penyedia">
              <span className="break-words">{wallet.institution.name}</span>
            </Row>
          ) : null}
          {archived ? <Row label="Status">Di Arsip</Row> : null}
        </dl>

        {wallet.scope === "SHARING" && wallet.institution?.kind === "CUSTOM" ? (
          <p className="mt-3 rounded-2xl bg-[#EFF4FA] px-4 py-3 text-xs text-[#46597A]">
            Label ini hanya metadata dompet. Daftar bank/penyedia pribadi tidak dibagikan ke
            anggota lain.
          </p>
        ) : null}

        {wallet.openingBalanceLocked ? (
          <p className="mt-3 rounded-2xl bg-[#EFF4FA] px-4 py-3 text-xs text-[#46597A]">
            Saldo awal terkunci: sudah ada transaksi untuk dompet ini.
          </p>
        ) : null}

        <div className="mt-5 space-y-2 border-t border-[#EAEEF4] pt-4">
          {!archived && wallet.canEdit ? (
            <Button variant="secondary" className="w-full" onClick={() => onEdit(wallet)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Ubah dompet
            </Button>
          ) : null}
          {!archived && wallet.canArchive ? (
            <Button variant="danger" className="w-full" onClick={() => onArchive(wallet)}>
              <Archive className="h-4 w-4" aria-hidden="true" />
              Arsipkan dompet
            </Button>
          ) : null}
          {archived && wallet.canRestore ? (
            <Button className="w-full" onClick={() => onRestore(wallet)}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Pulihkan dompet
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wider text-[#5C7191]">{label}</dt>
      <dd className="min-w-0 text-right text-[15px] font-medium leading-relaxed text-[#17304F]">{children}</dd>
    </div>
  );
}
