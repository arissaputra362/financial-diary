"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  ReceiptText,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScopePill } from "@/components/wallets/scope";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { formatDateLabel, formatDateTimeLabel } from "@/lib/dates";
import { formatSignedIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDTO } from "@/types/api";
import { categoryEmoji, categoryLabel, categoryTone, isTransferLeg, TYPE_LABELS } from "./categories";
import { ManualEntryForm } from "./ManualEntryForm";

export interface TransactionDetailSheetProps {
  /** A non-null row opens the dialog; null renders nothing. */
  row: TransactionDTO | null;
  mode: "active" | "trash";
  /** True while a trash/restore request for this row is in flight. */
  busy: boolean;
  onClose: () => void;
  onUpdate: (row: TransactionDTO) => void;
  onDelete: (row: TransactionDTO) => void;
  onRestore: (row: TransactionDTO) => void;
}

/*
  Detail for one transaction (design 03 extends §4): same dialog mechanics as
  AddTransactionSheet, bottom sheet on mobile and a centered modal on desktop.
  Detail facts and a single edit form share one dialog so focus remains scoped
  while correcting an active non-transfer transaction.
*/
export function TransactionDetailSheet({
  row,
  mode,
  busy,
  onClose,
  onUpdate,
  onDelete,
  onRestore,
}: TransactionDetailSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const close = useCallback(() => {
    setEditing(false);
    setViewerOpen(false);
    onClose();
  }, [onClose]);

  /*
    Shared dialog mechanics. The hook's stack keeps this sheet closed while the
    receipt viewer is open, so Escape closes the viewer first and focus returns
    to its trigger instead of dropping to `body` (BUG-3/BUG-4).
  */
  useDialogFocusTrap(row !== null, panelRef, close);

  useEffect(() => {
    if (row) closeRef.current?.focus();
  }, [row]);

  useEffect(() => {
    if (wasEditing.current && !editing && row) editTriggerRef.current?.focus();
    wasEditing.current = editing;
  }, [editing, row]);

  if (!row) return null;

  const transfer = isTransferLeg(row);
  const generic = row.wallet === null && row.source === null;
  const isIncome = row.type === "MONEY_IN";
  const title = generic
    ? isIncome
      ? "Transfer dari dompet pribadi"
      : "Transfer ke dompet pribadi"
    : row.merchant ?? row.note ?? (transfer ? "Transfer antar dompet" : categoryLabel(row.category));
  const showTransfer = transfer || generic;
  const signedAmount = formatSignedIDR(isIncome ? row.amountMinor : -row.amountMinor);
  const longAmount = signedAmount.length > 16;
  const amountColor =
    showTransfer ? "text-ink" : isIncome ? "text-green" : "text-ink";
  const heroClass = showTransfer
    ? "border-blue-border bg-blue-wash"
    : isIncome
      ? "border-success-border bg-mint"
      : "border-card-border bg-blue-wash";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="transaction-detail-title"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="transaction-detail-title" className="text-lg font-semibold tracking-tight text-ink">
            {editing ? "Edit transaksi" : "Detail transaksi"}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Tutup detail transaksi"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-blue-wash"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {editing ? (
          <div className="mt-5">
            <ManualEntryForm
              key={row.id}
              initialRow={row}
              onUpdated={(updated) => {
                onUpdate(updated);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : <>
        <div className={cn("mt-4 rounded-2xl border p-4", heroClass)}>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl",
                showTransfer ? "bg-blue-tint text-blue" : categoryTone(row.category),
              )}
            >
              {showTransfer ? <ArrowLeftRight className="h-5 w-5" /> : categoryEmoji(row.category)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-ink">{title}</p>
              <p className="text-xs font-medium text-ink-2">
                {showTransfer ? "Transfer antar dompet" : TYPE_LABELS[row.type]}
              </p>
            </div>
          </div>
          <p
            className={cn(
              "mt-3 whitespace-nowrap font-bold tracking-tight tabular-nums",
              longAmount
                ? "text-xl"
                : "text-[clamp(1.6rem,7vw,1.875rem)]",
              amountColor,
            )}
          >
            {signedAmount}
          </p>
        </div>

        {showTransfer ? (
          <p className="mt-3 rounded-2xl bg-blue-wash px-4 py-3 text-sm text-ink-2">
            Transfer antar dompet tercatat sebagai dua baris: uang keluar dari satu dompet dan uang
            masuk ke dompet lain.
          </p>
        ) : null}

        <dl className="mt-4 divide-y divide-row-divider">
          <DetailRow label="Jenis">
            <span className="inline-flex items-center gap-1.5">
              {isIncome ? (
                <ArrowDownLeft className="h-4 w-4 text-green" aria-hidden="true" />
              ) : (
                <ArrowUpRight className={cn("h-4 w-4", showTransfer ? "text-ink-3" : "text-blue")} aria-hidden="true" />
              )}
              {showTransfer ? "Transfer antar dompet" : TYPE_LABELS[row.type]}
            </span>
          </DetailRow>
          {!showTransfer ? (
            <DetailRow label="Kategori">
              <span aria-hidden="true">{categoryEmoji(row.category)}</span> {categoryLabel(row.category)}
            </DetailRow>
          ) : null}
          <DetailRow label="Tanggal">{formatDateTimeLabel(row.occurredAt)}</DetailRow>
          {row.merchant ? <DetailRow label="Toko">{row.merchant}</DetailRow> : null}
          {row.note ? <DetailRow label="Catatan">{row.note}</DetailRow> : null}
          {row.wallet ? (
            <DetailRow label="Dompet">
              <span className="inline-flex items-center gap-1.5">
                <ScopePill scope={row.wallet.scope} />
                <span>{row.wallet.name}</span>
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label="Sumber">
            {row.source === "OCR" ? "Scan struk" : row.source === "MANUAL" ? "Isi manual" : "Aktivitas umum"}
          </DetailRow>
          {row.receiptId ? (
            <DetailRow label="Struk">
              <button
                type="button"
                onClick={() => setViewerOpen(true)}
                className="inline-flex items-center gap-1.5 font-semibold text-blue underline underline-offset-2"
              >
                <ReceiptText className="h-4 w-4 text-ink-3" aria-hidden="true" />
                Lihat struk
              </button>
            </DetailRow>
          ) : null}
          <DetailRow label="Dicatat pada">{formatDateTimeLabel(row.createdAt)}</DetailRow>
          {mode === "trash" && row.deletedAt ? (
            <DetailRow label="Dihapus pada">{formatDateLabel(row.deletedAt)}</DetailRow>
          ) : null}
        </dl>

        <div className="mt-5 border-t border-row-divider pt-4">
          {mode === "active" ? (
            <>
              <div className={transfer ? "" : "grid grid-cols-2 gap-2"}>
                {!transfer ? (
                  <Button
                    ref={editTriggerRef}
                    className="w-full"
                    variant="secondary"
                    onClick={() => setEditing(true)}
                    disabled={busy}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => onDelete(row)}
                  disabled={busy}
                  isLoading={busy}
                  loadingLabel="Memproses"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Hapus
                </Button>
              </div>
              <p className="mt-2 text-center text-xs text-ink-3">
                Masih bisa dipulihkan lewat Undo atau tab Trash.
              </p>
            </>
          ) : (
            <Button
              className="w-full"
              onClick={() => onRestore(row)}
              disabled={busy}
              isLoading={busy}
              loadingLabel="Memproses"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Pulihkan
            </Button>
          )}
        </div>

        {viewerOpen && row.receiptId ? (
          <ReceiptImageViewer
            receiptId={row.receiptId}
            alt={`Foto struk untuk transaksi ${TYPE_LABELS[row.type]} ${signedAmount}`}
            onClose={() => setViewerOpen(false)}
          />
        ) : null}
        </>}
      </div>
    </div>
  );
}

/**
 * Safe receipt image viewer (C-30, design 06 §10.1). Bytes come only from the
 * authenticated server route; no Blob URL is ever held. Loading / error / not
 * found states are explicit, the dialog traps Tab focus, closes on
 * Escape/backdrop, and returns focus to the trigger that opened it.
 */
function ReceiptImageViewer({ receiptId, alt, onClose }: { receiptId: string; alt: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "error" | "notfound">("loading");
  const [retryToken, setRetryToken] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(true, panelRef, onClose);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await fetch(`/api/ocr/receipts/${receiptId}/image`, {
          credentials: "same-origin",
        });
        if (!active) return;
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          setState("notfound");
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (active) setState("error");
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [receiptId, retryToken]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/60 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label="Foto struk"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Foto struk</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup foto struk"
            className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 hover:bg-blue-wash"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {state === "notfound" ? (
          <div className="mt-4 rounded-2xl bg-blue-wash px-4 py-6 text-center">
            <p className="text-sm text-ink-2">Struk tidak tersedia.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand-green px-5 text-sm font-semibold text-white"
            >
              Tutup
            </button>
          </div>
        ) : state === "error" ? (
          <div className="mt-4 rounded-2xl bg-danger-bg px-4 py-6 text-center">
            <p className="text-sm text-danger">Struk gagal dimuat. Periksa koneksi, lalu coba lagi.</p>
            <button
              type="button"
              onClick={() => {
                setUrl(null);
                setState("loading");
                setRetryToken((token) => token + 1);
              }}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand-green px-5 text-sm font-semibold text-white"
            >
              Coba lagi
            </button>
          </div>
        ) : !url ? (
          <div className="mt-4" aria-busy="true">
            <div className="h-64 animate-pulse rounded-2xl bg-bar-track motion-reduce:animate-none" />
            <p className="mt-2 text-center text-sm text-ink-3">Memuat struk...</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} className="mt-4 w-full rounded-2xl object-contain" />
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wider text-ink-3">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-[15px] font-medium leading-relaxed text-ink">
        {children}
      </dd>
    </div>
  );
}
