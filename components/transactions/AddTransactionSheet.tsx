"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { PenLine, Sparkles, X } from "lucide-react";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { cn } from "@/lib/utils";
import type { TransactionDTO } from "@/types/api";
import { ManualEntryForm } from "./ManualEntryForm";

const ReceiptScanner = dynamic(
  () => import("./ReceiptScanner").then((module) => module.ReceiptScanner),
  {
    ssr: false,
    loading: () => <p className="py-8 text-center text-sm text-[#5C7191]">Menyiapkan pemindai struk...</p>,
  },
);

export interface AddTransactionSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (rows: TransactionDTO[]) => void;
}

/**
 * Add flow (design 03 §1): centered modal on desktop, bottom sheet on mobile.
 * Manual entry and receipt scan live behind one segmented control. This is an
 * action from `/transactions`, not a navigation item (A-31).
 */
export function AddTransactionSheet({ open, onClose, onCreated }: AddTransactionSheetProps) {
  const [tab, setTab] = useState<"manual" | "scan">("manual");
  const panelRef = useRef<HTMLDivElement>(null);

  /* Every close path resets the active tab (open state is owned by the parent). */
  const close = useCallback(() => {
    setTab("manual");
    onClose();
  }, [onClose]);

  /*
    Shared dialog mechanics (focus in on open, Escape/backdrop close, Tab stays
    inside, focus returns to the trigger). The stack inside the hook keeps this
    sheet closed while a nested wallet picker or create sheet is open, so Escape
    peels one layer at a time (BUG-3/BUG-4).
  */
  useDialogFocusTrap(open, panelRef, close);

  if (!open) return null;

  const handleCreated = (rows: TransactionDTO[]) => {
    onCreated(rows);
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#14273F]/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="add-transaction-title"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#D8E2EE] bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="add-transaction-title" className="text-lg font-semibold tracking-tight text-[#17304F]">
            Tambah transaksi
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Tutup"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#46597A] hover:bg-[#EFF4FA]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-[#EFF4FA] p-1" role="tablist" aria-label="Cara mengisi transaksi">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "manual"}
            onClick={() => setTab("manual")}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors",
              tab === "manual" ? "bg-white text-[#17304F] shadow-sm" : "text-[#46597A] hover:text-[#17304F]",
            )}
          >
            <PenLine className="h-4 w-4" aria-hidden="true" />
            Isi manual
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "scan"}
            onClick={() => setTab("scan")}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors",
              tab === "scan" ? "bg-white text-[#17304F] shadow-sm" : "text-[#46597A] hover:text-[#17304F]",
            )}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Scan struk
          </button>
        </div>

        <div className="mt-5">
          {tab === "manual" ? (
            <ManualEntryForm
              onCreated={handleCreated}
              onCancel={close}
              onSwitchToScan={() => setTab("scan")}
            />
          ) : (
            <ReceiptScanner
              onCreated={handleCreated}
              onCancel={close}
              onSwitchToManual={() => setTab("manual")}
            />
          )}
        </div>
      </div>
    </div>
  );
}