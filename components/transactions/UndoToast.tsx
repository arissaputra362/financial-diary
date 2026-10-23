"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Undo2, X } from "lucide-react";

export interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onExpire: () => void;
  onDismiss: () => void;
  seconds?: number;
}

/*
  Floating pill shown right after a soft delete (design 03 §4.2). The server
  already committed the delete; Undo triggers the separate restore call. The
  countdown is announced politely and the Undo control is keyboard reachable.
*/
export function UndoToast({ message, onUndo, onExpire, onDismiss, seconds = 5 }: UndoToastProps) {
  const [remaining, setRemaining] = useState(seconds);
  const undoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    undoRef.current?.focus();
  }, []);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire();
      return;
    }
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onExpire]);

  const width = `${Math.max(0, (remaining / seconds) * 100)}%`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 overflow-hidden rounded-full bg-[#14273F]/95 px-5 py-3 text-white shadow-2xl backdrop-blur-md lg:bottom-8"
    >
      <Trash2 className="h-4 w-4 shrink-0 text-[#9FB9D6]" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm">{message}</p>
      <button
        ref={undoRef}
        type="button"
        onClick={onUndo}
        className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[#DCFCE7] hover:bg-white/10"
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        Undo ({remaining}s)
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Tutup notifikasi"
        className="flex h-11 w-8 items-center justify-center rounded-full text-[#9FB9D6] hover:bg-white/10"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-0.5 bg-white/80 transition-[width] duration-1000 ease-linear"
        style={{ width }}
      />
    </div>
  );
}