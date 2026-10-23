"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { apiRequest } from "@/lib/api-client";
import { TRANSACTION_ADD_EVENT, setTransactionAddListenerAttached } from "@/lib/transaction-add-intent";
import {
  currentMonthKey,
  monthKeyLabel,
  monthKeyRange,
  resolveMonthKey,
  shiftMonthKey,
} from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDTO, TransactionListDTO } from "@/types/api";
import { AddTransactionSheet } from "./AddTransactionSheet";
import { activityHref } from "./activityUrl";
import { TransactionDetailSheet } from "./TransactionDetailSheet";
import { TransactionList } from "./TransactionList";
import { UndoToast } from "./UndoToast";
import { categoryLabel, isTransferLeg } from "./categories";

export interface ActivityViewProps {
  initialView: "active" | "trash";
  /** Validated `YYYY-MM` from the `?month=` deep link; absent = current month. */
  initialMonth?: string;
  /** `?add=1` from the nav/dashboard "Tambah" action opens the add sheet (A-27). */
  initialAdd?: boolean;
}

type ListFilter = "all" | "MONEY_IN" | "MONEY_OUT" | "transfer";
const FILTER_OPTIONS: ReadonlyArray<readonly [ListFilter, string]> = [
  ["all", "Semua"],
  ["MONEY_IN", "Uang masuk"],
  ["MONEY_OUT", "Uang keluar"],
  ["transfer", "Transfer"],
];

/*
  One URL builder for every list fetch: the active view is filtered by the
  selected month (server-side via from/to, one request = one month max) while
  cursor pagination keeps client state small (A-14).
*/
function buildListUrl(view: "active" | "trash", cursor: string | null, month: string): string {
  const base = view === "trash" ? "/api/transactions/trash" : "/api/transactions";
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (view === "active") {
    const { from, to } = monthKeyRange(month);
    params.set("from", from);
    params.set("to", to);
  }
  const queryString = params.toString();
  return queryString ? `${base}?${queryString}` : base;
}

/**
 * Activity page: grouped active list with soft delete + 5-second undo, month
 * navigation deep-linked as `?month=YYYY-MM` (server-side filter, A-14), type
 * filters, cursor pagination, a detail sheet, and a Trash tab
 * (`/transactions?view=trash`, A-31). Add is an in-page flow, never a nav item.
 * The page passes a key for view + month, so URL-driven view/month changes
 * restart with fresh state; the Add intent is handled separately (AC-F3-14).
 */
export function ActivityView({ initialView, initialMonth, initialAdd = false }: ActivityViewProps) {
  const router = useRouter();
  const [view, setView] = useState<"active" | "trash">(initialView);
  const [rows, setRows] = useState<TransactionDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  /* Active view is fetched month by month; the month lives in `?month=YYYY-MM`. */
  const [activeMonth, setActiveMonth] = useState<string>(() => resolveMonthKey(initialMonth));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  /* `?add=1` from the nav/dashboard opens the shared sheet (A-27). */
  const [sheetOpen, setSheetOpen] = useState(initialAdd);
  const [detail, setDetail] = useState<TransactionDTO | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Set by a successful save so the following close does not write a second URL. */
  const savedRef = useRef(false);
  const addTriggerRef = useRef<HTMLButtonElement>(null);

  /*
    Single URL writer for this page (AC-F3-14). `replace` keeps history clean;
    the month and Trash view survive whenever only the Add intent changes.
  */
  const writeUrl = useCallback(
    (nextView: "active" | "trash", month: string, add = false) => {
      router.replace(activityHref({ view: nextView, month, add }), { scroll: false });
    },
    [router],
  );

  /*
    `?add=1` remains the deep link for a fresh mount and for the URL the global
    Add action records. In-page opens are delivered synchronously by the event
    below; `suppressUrlAdd` prevents our own URL write from trying to reopen a
    sheet that a close already dismissed (AC-F3-14).
  */
  const [addIntent, setAddIntent] = useState(initialAdd);
  const [suppressUrlAdd, setSuppressUrlAdd] = useState(false);
  if (initialAdd !== addIntent) {
    setAddIntent(initialAdd);
    if (initialAdd) {
      if (suppressUrlAdd) setSuppressUrlAdd(false);
      else setSheetOpen(true);
    }
  }

  /*
    On `/transactions` the global Add actions dispatch this event instead of
    writing the URL themselves. The handler runs in the same tap task, so the
    sheet opens even while `router.replace` from the previous close is still
    pending (AC-F3-14); the single URL writer then records the intent.
  */
  useEffect(() => {
    const handleAddIntent = () => {
      setSuppressUrlAdd(true);
      setSheetOpen(true);
      writeUrl(view, activeMonth, true);
    };
    window.addEventListener(TRANSACTION_ADD_EVENT, handleAddIntent);
    setTransactionAddListenerAttached(true);
    return () => {
      window.removeEventListener(TRANSACTION_ADD_EVENT, handleAddIntent);
      setTransactionAddListenerAttached(false);
    };
  }, [writeUrl, view, activeMonth]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<TransactionListDTO>(buildListUrl(view, null, activeMonth))
      .then((response) => {
        if (!active) return;
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (!response.ok) {
          setRows([]);
          setNextCursor(null);
          setError(response.data?.error?.message ?? "Daftar transaksi belum bisa dimuat.");
          return;
        }
        setRows(response.data?.rows ?? []);
        setNextCursor(response.data?.nextCursor ?? null);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setNextCursor(null);
        setError("Daftar transaksi belum bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, activeMonth, reloadToken, router]);

  const reload = () => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  };

  const changeMonth = (delta: -1 | 1) => {
    const next = shiftMonthKey(activeMonth, delta);
    if (next === activeMonth) return;
    setDetail(null);
    setLoading(true);
    setActiveMonth(next);
    writeUrl(view, next);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await apiRequest<TransactionListDTO>(
        buildListUrl(view, nextCursor, activeMonth),
      );
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        showNotice("Transaksi lainnya belum bisa dimuat.");
        return;
      }
      const incoming = response.data?.rows ?? [];
      setRows((current) => {
        const seen = new Set(current.map((row) => row.id));
        return [...current, ...incoming.filter((row) => !seen.has(row.id))];
      });
      setNextCursor(response.data?.nextCursor ?? null);
    } catch {
      showNotice("Transaksi lainnya belum bisa dimuat.");
    } finally {
      setLoadingMore(false);
    }
  };

  const changeView = (next: "active" | "trash") => {
    setLoading(true);
    setUndo(null);
    setListFilter("all");
    setDetail(null);
    setView(next);
    /*
      The selected month travels back into the URL so returning from Trash (or
      a refresh) restores the same month instead of resetting to today.
    */
    writeUrl(next, activeMonth);
  };

  const handleDelete = async (row: TransactionDTO) => {
    setDeletingId(row.id);
    try {
      const response = await apiRequest(`/api/transactions/${row.id}/trash`, { method: "POST" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        showNotice("Transaksi belum bisa dihapus. Coba lagi.");
        return;
      }
      setRows((current) => current.filter((item) => item.id !== row.id));
      setDetail((current) => (current?.id === row.id ? null : current));
      setUndo({ id: row.id, label: labelFor(row) });
    } catch {
      showNotice("Transaksi belum bisa dihapus. Coba lagi.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUndo = async () => {
    const pending = undo;
    setUndo(null);
    if (!pending) return;
    try {
      const response = await apiRequest(`/api/transactions/${pending.id}/restore`, { method: "POST" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (response.ok) {
        reload();
        showNotice("Transaksi dikembalikan.");
      } else {
        showNotice("Transaksi belum bisa dipulihkan. Coba lagi.");
      }
    } catch {
      showNotice("Transaksi belum bisa dipulihkan. Coba lagi.");
    }
  };

  const handleRestore = async (row: TransactionDTO) => {
    setRestoringId(row.id);
    try {
      const response = await apiRequest(`/api/transactions/${row.id}/restore`, { method: "POST" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        showNotice("Transaksi belum bisa dipulihkan. Coba lagi.");
        return;
      }
      setDetail(null);
      reload();
      showNotice("Transaksi dipulihkan ke daftar aktivitas.");
    } catch {
      showNotice("Transaksi belum bisa dipulihkan. Coba lagi.");
    } finally {
      setRestoringId(null);
    }
  };

  const handleCreated = () => {
    /*
      A successful save commits its target view exactly once. The close that
      follows (inside AddTransactionSheet) must not replace the URL again.
    */
    savedRef.current = true;
    showNotice("Transaksi tersimpan.");
    if (view === "active") {
      reload();
    } else {
      setView("active");
      setListFilter("all");
      setUndo(null);
      setDetail(null);
      setLoading(true);
    }
    writeUrl("active", activeMonth);
  };

  /*
    One close path for X, Batal, Escape, and backdrop. It only removes the Add
    intent and keeps the current month or Trash view; a save already wrote the
    URL above. Focus falls back to the page trigger when the opener is gone
    (cross-page `?add=1` navigation).
  */
  const handleSheetClose = useCallback(() => {
    /* Intent state clears synchronously; the URL replace follows. */
    setSheetOpen(false);
    const saved = savedRef.current;
    savedRef.current = false;
    /*
      Always write the clean URL when not saved. The Add intent may still be
      landing from a tap during this same transition, so checking the URL here
      would miss it and leave `add=1` stuck.
    */
    if (!saved) writeUrl(view, activeMonth);
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) {
        const fallback =
          addTriggerRef.current ??
          document.querySelector<HTMLButtonElement>("[data-add-transaction-trigger]");
        fallback?.focus();
      }
    });
  }, [view, activeMonth, writeUrl]);

  /*
    Summary counts money in and money out only; transfer legs move money
    between wallets, so they are excluded and called out separately.
  */
  const summary = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    let transfers = 0;
    for (const row of rows) {
      if (isTransferLeg(row)) {
        transfers += 1;
        continue;
      }
      if (row.type === "MONEY_IN") moneyIn += row.amountMinor;
      else if (row.type === "MONEY_OUT") moneyOut += row.amountMinor;
    }
    return { moneyIn, moneyOut, transfers, count: rows.length };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (listFilter === "all") return rows;
    if (listFilter === "transfer") return rows.filter((row) => isTransferLeg(row));
    return rows.filter((row) => row.type === listFilter && !isTransferLeg(row));
  }, [rows, listFilter]);

  const showSummaryAndFilter = view === "active" && !loading && !error && rows.length > 0;
  const summaryLength = Math.max(
    formatIDR(summary.moneyIn).length,
    formatIDR(summary.moneyOut).length,
  );
  const veryLongSummary = summaryLength > 16;
  const longSummary = summaryLength > 13;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5C7191]">Catatan keuangan keluarga</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17304F]">Aktivitas</h1>
        </div>
        <Button
          ref={addTriggerRef}
          data-add-transaction-trigger
          onClick={() => setSheetOpen(true)}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah transaksi
        </Button>
      </div>

      <div className="flex items-center gap-2" role="tablist" aria-label="Daftar aktivitas">
        {(
          [
            ["active", "Transaksi"],
            ["trash", "Trash"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => changeView(value)}
            className={cn(
              "min-h-11 rounded-full px-5 text-sm font-semibold transition-colors",
              view === value
                ? "bg-[#14273F] text-white"
                : "border border-[#BFD3E8] bg-white text-[#1D4F87] hover:bg-[#EFF4FA]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "active" ? (
        <div
          className="flex items-center justify-between gap-2 rounded-full border border-[#D8E2EE] bg-white p-1.5 pl-5"
          role="group"
          aria-label="Pilih bulan aktivitas"
        >
          <p className="truncate text-sm font-bold text-[#17304F]">{monthKeyLabel(activeMonth)}</p>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Lihat bulan sebelumnya"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#46597A] hover:bg-[#EFF4FA]"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              disabled={activeMonth >= currentMonthKey()}
              aria-label="Lihat bulan berikutnya"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#46597A] hover:bg-[#EFF4FA] disabled:cursor-not-allowed disabled:text-[#5C7191] disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p role="status" aria-live="polite" className="rounded-2xl bg-[#DCFCE7] px-4 py-3 text-sm font-medium text-[#166534]">
          {notice}
        </p>
      ) : null}

      {showSummaryAndFilter ? (
        <Card variant="tint" className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#46597A]">
                Ringkasan aktivitas
              </p>
              <p className="mt-1 text-sm text-[#46597A]">
                Dihitung dari {summary.count} transaksi yang tampil.
              </p>
              {summary.transfers > 0 ? (
                <p className="mt-0.5 text-xs text-[#46597A]">
                  Transfer antar dompet tidak dihitung.
                </p>
              ) : null}
            </div>
            <dl
              className={
                veryLongSummary
                  ? "grid w-full grid-cols-1 gap-4 sm:w-auto"
                  : longSummary
                    ? "grid w-full grid-cols-1 gap-4 sm:w-auto sm:min-w-64 sm:grid-cols-2"
                    : "grid w-full grid-cols-2 gap-4 sm:w-auto sm:min-w-64"
              }
            >
              <div className="min-w-0">
                <dt className="text-xs font-medium text-[#46597A]">Uang masuk</dt>
                <dd className="whitespace-nowrap text-[clamp(1rem,4.4vw,1.125rem)] font-bold tabular-nums text-[#166534]">
                  {formatIDR(summary.moneyIn)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium text-[#46597A]">Uang keluar</dt>
                <dd className="whitespace-nowrap text-[clamp(1rem,4.4vw,1.125rem)] font-bold tabular-nums text-[#17304F]">
                  {formatIDR(summary.moneyOut)}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      ) : null}

      {showSummaryAndFilter ? (
        <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-[#EFF4FA] p-1" role="group" aria-label="Saring transaksi">
          {FILTER_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={listFilter === value}
              onClick={() => setListFilter(value)}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors",
                listFilter === value
                  ? "bg-white text-[#17304F] shadow-sm"
                  : "text-[#46597A] hover:text-[#17304F]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {showSummaryAndFilter && visibleRows.length === 0 ? (
        <Card className="text-center">
          <p className="text-[15px] font-medium text-[#17304F]">
            Tidak ada transaksi untuk saringan ini.
          </p>
          <button
            type="button"
            onClick={() => setListFilter("all")}
            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-[#BFD3E8] bg-white px-5 text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA]"
          >
            Tampilkan semua
          </button>
        </Card>
      ) : (
        <TransactionList
          rows={visibleRows}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          mode={view}
          nextCursor={nextCursor}
          deletingId={deletingId}
          restoringId={restoringId}
          emptyDescription={
            view === "active"
              ? `Belum ada catatan untuk ${monthKeyLabel(activeMonth)}. Pilih bulan lain di atas, atau catat transaksimu.`
              : undefined
          }
          emptyAction={
            view === "active" ? (
              <Button onClick={() => setSheetOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Tambah transaksi
              </Button>
            ) : undefined
          }
          onRetry={reload}
          onLoadMore={() => void loadMore()}
          onOpenDetail={(row) => setDetail(row)}
          onDelete={(row) => void handleDelete(row)}
          onRestore={(row) => void handleRestore(row)}
        />
      )}

      <AddTransactionSheet open={sheetOpen} onClose={handleSheetClose} onCreated={handleCreated} />

      <TransactionDetailSheet
        row={detail}
        mode={view}
        busy={
          (detail !== null && (deletingId === detail.id || restoringId === detail.id)) || false
        }
        onClose={() => setDetail(null)}
        onDelete={(row) => void handleDelete(row)}
        onRestore={(row) => void handleRestore(row)}
      />

      {undo ? (
        <UndoToast
          message={`Transaksi ${undo.label} dipindahkan.`}
          onUndo={() => void handleUndo()}
          onExpire={() => setUndo(null)}
          onDismiss={() => setUndo(null)}
        />
      ) : null}
    </div>
  );
}

function labelFor(row: TransactionDTO): string {
  const name = row.merchant ?? row.note ?? (isTransferLeg(row) ? "Transfer" : categoryLabel(row.category));
  return `${formatIDR(row.amountMinor)} ${name}`;
}
