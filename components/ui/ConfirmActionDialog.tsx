"use client";

import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";

type ConfirmActionDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(open, panelRef, () => {
    if (!busy) onCancel();
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-scrim/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        aria-describedby="confirm-action-description"
        tabIndex={-1}
        className="w-full rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="confirm-action-title" className="text-lg font-semibold text-ink">{title}</h2>
            <p id="confirm-action-description" className="mt-1 text-sm leading-relaxed text-ink-2">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
          <Button variant="danger" onClick={onConfirm} isLoading={busy} loadingLabel="Memproses">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
