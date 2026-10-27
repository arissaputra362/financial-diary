"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, ReceiptText, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonthlyReport, type ReportScope } from "@/components/reports/MonthlyReport";
import { Button } from "@/components/ui/Button";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { Card } from "@/components/ui/Card";
import { apiRequest } from "@/lib/api-client";
import { TRANSACTION_ADD_EVENT, setTransactionAddListenerAttached } from "@/lib/transaction-add-intent";
import {
  currentMonthKey,
  formatDateLabel,
  monthKeyLabel,
  monthKeyRange,
  resolveMonthKey,
  shiftMonthKey,
} from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDTO, TransactionListDTO, WalletDTO } from "@/types/api";
import { AddTransactionSheet } from "./AddTransactionSheet";
import {
  activityHref,
  activityListUrl,
  type ActivityTypeFilter,
  type ActivityViewMode,
} from "./activityUrl";
import {
  filterActivityRows,
  mergeActivityRows,
  shouldOfferLoadMore,
} from "./activityRows";
import { TransactionDetailSheet } from "./TransactionDetailSheet";
import { TransactionList } from "./TransactionList";
import { UndoToast } from "./UndoToast";
import { categoryLabel, isTransferLeg } from "./categories";

export interface ActivityViewProps {
  initialView: ActivityViewMode;
  /** Validated `YYYY-MM` from the `?month=` deep link; absent = current month. */
  initialMonth?: string;
  /** `?add=1` from the nav/dashboard "Tambah" action opens the add sheet (A-27). */
  initialAdd?: boolean;
  initialFrom?: string;
  initialTo?: string;
  initialFilter?: ActivityTypeFilter;
  /** Active tab wallet filter, or the selected report wallet on Ringkasan. */
  initialWalletId?: string;
  initialReportScope?: ReportScope;
  initialReportWalletId?: string;
  initialData?: TransactionListDTO;
}

type ListFilter = "all" | "MONEY_IN" | "MONEY_OUT" | "transfer";
const FILTER_OPTIONS: ReadonlyArray<readonly [ListFilter, string]> = [
  ["all", "Semua"],
  ["MONEY_IN", "Uang masuk"],
  ["MONEY_OUT", "Uang keluar"],
  ["transfer", "Transfer"],
];

/**
 * Activity page: grouped active list with soft delete + 5-second undo, month
 * navigation deep-linked as `?month=YYYY-MM` (server-side filter, A-14), type
 * filters, cursor pagination, a detail sheet, a Trash tab
 * (`/transactions?view=trash`, A-31), and the monthly report tab
 * (`?view=ringkasan`, AC-F7-1). Add is an in-page flow, never a nav item.
 * The page passes a key for view + month, so URL-driven view/month changes
 * restart with fresh state; the Add intent is handled separately (AC-F3-14).
 * Report scope and wallet travel in the URL so a month remount restores them.
 */
export function ActivityView({
  initialView,
  initialMonth,
  initialFrom,
  initialTo,
  initialAdd = false,
  initialFilter = "all",
  initialWalletId,
  initialReportScope = "shared",
  initialReportWalletId,
  initialData,
}: ActivityViewProps) {
  const router = useRouter();
  const [view, setView] = useState<ActivityViewMode>(initialView);
  const [rows, setRows] = useState<TransactionDTO[]>(initialData?.rows ?? []);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionDTO | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [listFilter, setListFilter] = useState<ListFilter>(() => filterFromUrl(initialFilter));
  const [walletId, setWalletId] = useState(initialWalletId ?? "");
  const [reportScope, setReportScope] = useState<ReportScope>(initialReportScope);
  const [reportWalletId, setReportWalletId] = useState(initialReportWalletId ?? "");
  const [wallets, setWallets] = useState<WalletDTO[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletsError, setWalletsError] = useState<string | null>(null);
  /* Active view is fetched month by month; the month lives in `?month=YYYY-MM`. */
  const [activeMonth, setActiveMonth] = useState<string>(() => resolveMonthKey(initialMonth));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerValue, setMonthPickerValue] = useState(() => resolveMonthKey(initialMonth));
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  /* Applied range: drives the fetch and the URL. */
  const [dateFrom, setDateFrom] = useState(initialFrom ?? "");
  const [dateTo, setDateTo] = useState(initialTo ?? "");
  /* Draft range: bound to the inputs, committed only by "Terapkan". */
  const [draftFrom, setDraftFrom] = useState(initialFrom ?? "");
  const [draftTo, setDraftTo] = useState(initialTo ?? "");
  const [dateFilterError, setDateFilterError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialView !== "ringkasan" && !initialData);
  /* Type-filter fetches keep the filter bar mounted so keyboard focus survives. */
  const [filterLoading, setFilterLoading] = useState(false);
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
    Deep-link validation must run after the wallet list resolves, not inside an
    effect body. The fetch callback calls the latest validator through this ref.
  */
  const validateSelectionsRef = useRef<(nextWallets: WalletDTO[]) => void>(() => {});
  /* Prefetched rows serve only the first render; a later filter change refetches. */
  const initialDataConsumed = useRef(false);

  /*
    Single URL writer for this page (AC-F3-14, AC-F7-1/2/6). `replace` keeps
    history clean. The open tab, month, transaction filter/wallet, and report
    scope/wallet all travel together, so closing a sheet or changing a month
    never resets the other controls.
  */
  const writeUrl = useCallback(
    (next: {
      view: ActivityViewMode;
      month?: string;
      add?: boolean;
      from?: string;
      to?: string;
      filter?: ListFilter;
      walletId?: string;
      reportScope?: ReportScope;
      reportWalletId?: string;
    }) => {
      const nextMonth = next.month ?? activeMonth;
      const nextFilter = next.filter ?? listFilter;
      const transactionWallet = next.walletId ?? walletId;
      const nextScope = next.reportScope ?? reportScope;
      const nextReportWallet = next.reportWalletId ?? reportWalletId;
      const nextFrom = next.from ?? dateFrom;
      const nextTo = next.to ?? dateTo;
      router.replace(
        activityHref({
          view: next.view,
          month: nextMonth,
          add: next.add,
          from: next.view === "active" ? nextFrom : undefined,
          to: next.view === "active" ? nextTo : undefined,
          filter: next.view === "active" ? filterToUrl(nextFilter) : "all",
          walletId:
            next.view === "active"
              ? transactionWallet
              : next.view === "ringkasan"
                ? nextReportWallet
                : undefined,
          reportScope: nextScope,
        }),
        { scroll: false },
      );
    },
    [activeMonth, dateFrom, dateTo, listFilter, reportScope, reportWalletId, router, walletId],
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
      writeUrl({ view, month: activeMonth, add: true });
    };

    window.addEventListener(TRANSACTION_ADD_EVENT, handleAddIntent);
    setTransactionAddListenerAttached(true);
    return () => {
      window.removeEventListener(TRANSACTION_ADD_EVENT, handleAddIntent);
      setTransactionAddListenerAttached(false);
    };
  }, [activeMonth, writeUrl, view]);

  useEffect(() => {
    let active = true;
    /* `view=all` keeps archived wallets available to the report (AC-F7-8). */
    apiRequest<{ wallets: WalletDTO[] }>("/api/wallets?view=all")
      .then((response) => {
        if (!active) return;
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (response.status === 403) {
          router.push("/waiting-for-approval");
          return;
        }
        if (!response.ok) {
          setWalletsError("Filter dompet belum bisa dimuat.");
          return;
        }
        const nextWallets = response.data?.wallets ?? [];
        setWallets(nextWallets);
        setWalletsError(null);
        validateSelectionsRef.current(nextWallets);
      })
      .catch(() => {
        if (active) setWalletsError("Filter dompet belum bisa dimuat.");
      })
      .finally(() => {
        if (active) setWalletsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

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
    /* Ringkasan draws every number from its own aggregate request (AC-F7-14). */
    if (view === "ringkasan") return;
    if (initialData && !initialDataConsumed.current) {
      initialDataConsumed.current = true;
      return;
    }
    let active = true;
    apiRequest<TransactionListDTO>(
      activityListUrl({
        view,
        month: activeMonth,
        walletId,
        from: dateFrom,
        to: dateTo,
        filter: filterToUrl(listFilter),
      }),
    )
      .then((response) => {
        if (!active) return;
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (response.status === 403) {
          router.push("/waiting-for-approval");
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
        if (active) {
          setLoading(false);
          setFilterLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [
    activeMonth,
    dateFrom,
    dateTo,
    initialData,
    listFilter,
    reloadToken,
    router,
    view,
    walletId,
  ]);

  const reload = () => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  };

  const changeMonth = (delta: -1 | 1) => {
    const next = shiftMonthKey(activeMonth, delta);
    if (next === activeMonth) return;
    setDetail(null);
    if (view !== "ringkasan") setLoading(true);
    setActiveMonth(next);
    resetDateFilter();
    setFilterPanelOpen(false);
    /* The report scope and wallet survive the month change (AC-F7-2). */
    writeUrl({ view, month: next, from: "", to: "" });
  };

  const openMonthPicker = () => {
    setMonthPickerValue(activeMonth);
    setMonthPickerOpen(true);
  };

  const applyMonthPicker = () => {
    const next = resolveMonthKey(monthPickerValue);
    if (next !== activeMonth) {
      setDetail(null);
      if (view !== "ringkasan") setLoading(true);
      setActiveMonth(next);
      /* The date range belongs to one month, so a new month clears it. */
      resetDateFilter();
      setFilterPanelOpen(false);
      writeUrl({ view, month: next, from: "", to: "" });
    }
    setMonthPickerOpen(false);
  };

  const resetDateFilter = () => {
    setDateFrom("");
    setDateTo("");
    setDraftFrom("");
    setDraftTo("");
    setDateFilterError(null);
  };

  const openFilterPanel = () => {
    /* Reopening starts from the applied range, not an abandoned draft. */
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
    setDateFilterError(null);
    setFilterPanelOpen(true);
  };

  const applyDateFilter = () => {
    const range = monthKeyRange(activeMonth);
    if (
      (draftFrom && (draftFrom < range.from || draftFrom > range.to)) ||
      (draftTo && (draftTo < range.from || draftTo > range.to))
    ) {
      setDateFilterError("Rentang tanggal harus berada di bulan yang dipilih.");
      return;
    }
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setDateFilterError("Tanggal mulai tidak boleh setelah tanggal akhir.");
      return;
    }
    setDateFilterError(null);
    if (draftFrom !== dateFrom || draftTo !== dateTo) {
      setLoading(true);
      setDateFrom(draftFrom);
      setDateTo(draftTo);
    }
    writeUrl({ view: "active", month: activeMonth, from: draftFrom, to: draftTo });
    setFilterPanelOpen(false);
  };

  const clearDateFilter = () => {
    const hadFilter = Boolean(dateFrom || dateTo);
    resetDateFilter();
    if (hadFilter) setLoading(true);
    writeUrl({ view: "active", month: activeMonth, from: "", to: "" });
  };

  const clearAllFilters = () => {
    setRows([]);
    setNextCursor(null);
    setListFilter("all");
    setWalletId("");
    resetDateFilter();
    setFilterPanelOpen(false);
    setFilterLoading(false);
    setLoading(true);
    writeUrl({
      view: "active",
      month: activeMonth,
      filter: "all",
      walletId: "",
      from: "",
      to: "",
    });
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await apiRequest<TransactionListDTO>(
        activityListUrl({
          view: view === "trash" ? "trash" : "active",
          cursor: nextCursor,
          month: activeMonth,
          walletId,
          from: dateFrom,
          to: dateTo,
          filter: filterToUrl(listFilter),
        }),
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
      setRows((current) => mergeActivityRows(current, incoming));
      setNextCursor(response.data?.nextCursor ?? null);
    } catch {
      showNotice("Transaksi lainnya belum bisa dimuat.");
    } finally {
      setLoadingMore(false);
    }
  };

  const changeView = (next: ActivityViewMode) => {
    setUndo(null);
    setListFilter("all");
    setWalletId("");
    setDetail(null);
    setFilterPanelOpen(false);
    resetDateFilter();
    setView(next);
    if (next === "ringkasan") {
      setLoading(false);
    } else {
      setLoading(true);
    }
    /*
      The selected month travels back into the URL so returning from Trash or
      Ringkasan (or a refresh) restores the same month instead of today.
      Report scope/wallet stay put; only the transaction filter resets.
    */
    writeUrl({
      view: next,
      month: activeMonth,
      filter: "all",
      walletId: "",
      from: "",
      to: "",
    });
  };

  const changeReportScope = (next: ReportScope) => {
    /* A scope change always resets the wallet to Semua dompet (AC-F7-8). */
    setReportScope(next);
    setReportWalletId("");
    writeUrl({
      view: "ringkasan",
      month: activeMonth,
      reportScope: next,
      reportWalletId: "",
    });
  };

  const changeReportWallet = (next: string) => {
    setReportWalletId(next);
    writeUrl({ view: "ringkasan", month: activeMonth, reportWalletId: next });
  };

  const handleDelete = async () => {
    const row = transactionToDelete;
    if (!row) return;
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
      setTransactionToDelete(null);
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
    writeUrl({ view: "active", month: activeMonth });
  };

  const handleUpdated = (row: TransactionDTO) => {
    setRows((current) => current.map((item) => (item.id === row.id ? row : item)));
    setDetail(null);
    reload();
    showNotice("Perubahan transaksi disimpan.");
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
    if (!saved) writeUrl({ view, month: activeMonth });
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
    Keep the latest deep-link validator available to the wallet fetch callback.
    This effect only updates a ref, so it never cascades a render.
  */
  useEffect(() => {
    validateSelectionsRef.current = (nextWallets) => {
      if (view === "active" && walletId && !nextWallets.some((wallet) => wallet.id === walletId)) {
        setWalletId("");
        setLoading(true);
        setReloadToken((token) => token + 1);
        showNotice("Dompet yang dipilih tidak tersedia. Menampilkan semua dompet.");
        writeUrl({ view: "active", month: activeMonth, walletId: "" });
        return;
      }
      if (view !== "ringkasan") return;
      const inScope = nextWallets.filter((wallet) =>
        reportScope === "shared" ? wallet.scope === "SHARING" : wallet.scope === "PERSONAL",
      );
      if (reportScope === "personal" && inScope.length === 0) {
        setReportScope("shared");
        setReportWalletId("");
        writeUrl({
          view: "ringkasan",
          month: activeMonth,
          reportScope: "shared",
          reportWalletId: "",
        });
        return;
      }
      if (reportWalletId && !inScope.some((wallet) => wallet.id === reportWalletId)) {
        setReportWalletId("");
        showNotice("Dompet yang dipilih tidak tersedia. Menampilkan semua dompet.");
        writeUrl({
          view: "ringkasan",
          month: activeMonth,
          reportScope,
          reportWalletId: "",
        });
      }
    };
  });

  const visibleRows = useMemo(
    () => filterActivityRows(rows, filterToUrl(listFilter)),
    [rows, listFilter],
  );

  /*
    The report needs archived wallets (AC-F7-8); the transaction filter keeps
    hiding them except when one is the current selection from a shared URL.
  */
  const transactionWallets = useMemo(
    () => wallets.filter((wallet) => wallet.archivedAt === null || wallet.id === walletId),
    [walletId, wallets],
  );

  const selectedWalletName = transactionWallets.find((wallet) => wallet.id === walletId)?.name;
  const appliedDateLabel = dateFrom && dateTo
    ? `Tanggal: ${formatDateLabel(dateFrom)} s.d. ${formatDateLabel(dateTo)}`
    : dateFrom
      ? `Dari ${formatDateLabel(dateFrom)}`
      : dateTo
        ? `Sampai ${formatDateLabel(dateTo)}`
        : null;
  const activeFilterLabels = [
    listFilter === "all" ? null : FILTER_OPTIONS.find(([value]) => value === listFilter)?.[1] ?? null,
    appliedDateLabel,
    walletId ? `Dompet: ${selectedWalletName ?? "Terpilih"}` : null,
  ].filter((label): label is string => label !== null);
  const showFilters = view === "active" && !loading && !error;

  return (
    <div className="space-y-5">
      <PageHeader
        className="flex-row flex-wrap items-center justify-start gap-3 print:hidden"
        actionsClassName="w-auto flex-row items-center gap-3"
        eyebrow="Financial Diary"
        title="Aktivitas"
        icon={ReceiptText}
        actions={
          <Button
            ref={addTriggerRef}
            data-add-transaction-trigger
            onClick={() => setSheetOpen(true)}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="sm:hidden">Tambah</span>
            <span className="hidden sm:inline">Tambah transaksi</span>
          </Button>
        }
      />

      <div
        className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2 print:hidden"
        role="tablist"
        aria-label="Tampilan aktivitas"
      >
        {(
          [
            ["active", "Transaksi"],
            ["ringkasan", "Ringkasan"],
            ["trash", "Trash"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            id={`activity-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={view === value}
            aria-controls={`activity-panel-${value}`}
            onClick={() => changeView(value)}
            className={cn(
              "min-h-11 rounded-full px-2 text-center text-sm font-semibold transition-colors sm:px-5",
              view === value
                ? "bg-navy text-white"
                : "border border-blue-border bg-card text-blue hover:bg-blue-wash",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        id={`activity-panel-${view}`}
        role="tabpanel"
        aria-labelledby={`activity-tab-${view}`}
        className="space-y-5"
      >
      {view === "active" || view === "ringkasan" ? (
        <div
          className="flex items-center justify-between gap-2 rounded-full border border-card-border bg-card p-1.5 pl-5 print:hidden"
          role="group"
          aria-label="Pilih bulan aktivitas"
        >
          <button
            type="button"
            onClick={openMonthPicker}
            className="min-h-11 min-w-0 truncate rounded-full px-3 text-left text-sm font-bold text-ink hover:bg-blue-wash focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/15"
            aria-label={`Pilih bulan, saat ini ${monthKeyLabel(activeMonth)}`}
          >
            {monthKeyLabel(activeMonth)}
          </button>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Lihat bulan sebelumnya"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-blue-wash"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              disabled={activeMonth >= currentMonthKey()}
              aria-label="Lihat bulan berikutnya"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-blue-wash disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {showFilters ? (
        <div className="space-y-3 print:hidden">
          <button
            type="button"
            aria-controls="activity-filter-panel"
            aria-expanded={filterPanelOpen}
            onClick={() => (filterPanelOpen ? setFilterPanelOpen(false) : openFilterPanel())}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-card-border bg-card px-4 text-left text-sm font-semibold text-ink hover:bg-blue-wash"
          >
            <span className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-blue" aria-hidden="true" />
              <span>Filter transaksi</span>
              {activeFilterLabels.length > 0 ? (
                <span className="shrink-0 rounded-full bg-blue-tint px-2.5 py-1 text-xs font-semibold text-blue">
                  {activeFilterLabels.length} aktif
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-ink-3 transition-transform", filterPanelOpen && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          {filterPanelOpen ? (
            <div
              id="activity-filter-panel"
              aria-label="Filter transaksi"
              className="space-y-4 rounded-2xl border border-card-border bg-card p-4"
            >
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink-2">Jenis transaksi</p>
                <div
                  className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1 sm:rounded-2xl sm:bg-blue-wash sm:p-1"
                  role="group"
                  aria-label="Saring transaksi"
                >
                  {FILTER_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={listFilter === value}
                      onClick={() => {
                        if (value !== listFilter) {
                          /* A new type cursor: never continue the previous filter. */
                          setRows([]);
                          setNextCursor(null);
                          setFilterLoading(true);
                          setListFilter(value);
                        }
                        writeUrl({
                          view: "active",
                          month: activeMonth,
                          filter: value,
                        });
                      }}
                      className={cn(
                        "flex min-h-11 items-center justify-center rounded-full border px-3 text-sm font-semibold transition-colors sm:border-0 sm:px-4",
                        listFilter === value
                          ? "border-navy bg-navy text-white shadow-sm sm:bg-card sm:text-ink"
                          : "border-card-border bg-card text-ink-2 hover:text-ink sm:bg-transparent sm:hover:bg-card",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-card-border bg-card px-3 text-sm font-semibold text-ink-2">
                <span className="shrink-0">Dompet</span>
                <select
                  value={walletId}
                  disabled={walletsLoading || Boolean(walletsError)}
                  onChange={(event) => {
                    const nextWalletId = event.target.value;
                    setLoading(true);
                    setWalletId(nextWalletId);
                    setReloadToken((token) => token + 1);
                    writeUrl({
                      view: "active",
                      month: activeMonth,
                      filter: listFilter,
                      walletId: nextWalletId,
                    });
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none"
                  aria-label="Filter berdasarkan dompet"
                >
                  <option value="">
                    {walletsLoading
                      ? "Memuat dompet..."
                      : walletsError
                        ? "Dompet tidak tersedia"
                        : "Semua dompet"}
                  </option>
                  {!walletsLoading &&
                    transactionWallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name} · {wallet.scope === "SHARING" ? "Bersama" : "Pribadi"}
                        {wallet.archivedAt ? ", Arsip" : ""}
                      </option>
                    ))}
                </select>
              </label>
              {walletsError ? (
                <p role="status" className="text-xs text-danger">{walletsError}</p>
              ) : null}

              <div className="border-t border-row-divider pt-3">
                <p className="text-sm font-semibold text-ink-2">
                  Rentang tanggal <span className="font-normal text-ink-3">(opsional)</span>
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  Pilih rentang di dalam {monthKeyLabel(activeMonth)}.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
                    Dari
                    <input
                      type="date"
                      value={draftFrom}
                      max={draftTo || monthKeyRange(activeMonth).to}
                      onChange={(event) => setDraftFrom(event.target.value)}
                      className="min-h-11 rounded-2xl border border-input-border px-3 text-sm text-ink focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
                    Sampai
                    <input
                      type="date"
                      value={draftTo}
                      min={draftFrom || monthKeyRange(activeMonth).from}
                      max={monthKeyRange(activeMonth).to}
                      onChange={(event) => setDraftTo(event.target.value)}
                      className="min-h-11 rounded-2xl border border-input-border px-3 text-sm text-ink focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
                    />
                  </label>
                </div>
                {dateFilterError ? (
                  <p role="alert" className="mt-2 text-xs text-danger">{dateFilterError}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {(draftFrom || draftTo) ? (
                    <button
                      type="button"
                      onClick={clearDateFilter}
                      className="min-h-11 rounded-full border border-blue-border px-4 text-sm font-semibold text-blue hover:bg-blue-wash"
                    >
                      Hapus tanggal
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={applyDateFilter}
                    className="min-h-11 rounded-full bg-brand-green px-4 text-sm font-semibold text-white hover:bg-brand-green-hover"
                  >
                    Terapkan tanggal
                  </button>
                </div>
              </div>

              {activeFilterLabels.length > 0 ? (
                <div className="flex justify-end border-t border-row-divider pt-2">
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="min-h-11 rounded-full px-3 text-sm font-semibold text-blue underline underline-offset-2 hover:text-ink"
                  >
                    Hapus semua filter
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {!filterPanelOpen && walletsError ? (
            <p role="status" className="text-xs text-danger">{walletsError}</p>
          ) : null}

          {!filterPanelOpen && activeFilterLabels.length > 0 ? (
            <div className="space-y-2" aria-label="Filter aktif">
              <div className="flex flex-wrap gap-2">
                {activeFilterLabels.map((label) => (
                  <span
                    key={label}
                    className="max-w-full truncate rounded-full bg-blue-tint px-3 py-1.5 text-xs font-semibold text-blue"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-blue underline underline-offset-2 hover:text-ink"
                >
                  Hapus semua filter
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {monthPickerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/35 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMonthPickerOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-card-border bg-card p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="month-picker-title"
          >
            <h2 id="month-picker-title" className="text-lg font-semibold text-ink">
              Pilih bulan aktivitas
            </h2>
            <p className="mt-1 text-sm text-ink-3">
              Pilih bulan dan tahun untuk melihat transaksi.
            </p>
            <label className="mt-5 flex flex-col gap-2 text-sm font-semibold text-ink-2">
              Bulan dan tahun
              <input
                type="month"
                value={monthPickerValue}
                max={currentMonthKey()}
                onChange={(event) => setMonthPickerValue(event.target.value)}
                className="min-h-12 rounded-2xl border border-input-border bg-card px-3 text-base text-ink accent-blue focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMonthPickerOpen(false)}
                className="min-h-11 rounded-full border border-blue-border px-4 text-sm font-semibold text-blue hover:bg-blue-wash"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={applyMonthPicker}
                className="min-h-11 rounded-full bg-brand-green px-4 text-sm font-semibold text-white hover:bg-brand-green-hover"
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p role="status" aria-live="polite" className="rounded-2xl bg-mint px-4 py-3 text-sm font-medium text-green print:hidden">
          {notice}
        </p>
      ) : null}

      {view === "ringkasan" ? (
        <MonthlyReport
          month={activeMonth}
          wallets={wallets}
          walletsLoading={walletsLoading}
          walletsError={walletsError}
          scope={reportScope}
          walletId={reportWalletId}
          onScopeChange={changeReportScope}
          onWalletChange={changeReportWallet}
          onAddTransaction={() => setSheetOpen(true)}
        />
      ) : (
        <>
          {showFilters && !filterLoading && listFilter !== "all" && visibleRows.length === 0 ? (
            shouldOfferLoadMore(visibleRows.length, nextCursor) ? (
              <Card className="text-center">
                <p className="text-[15px] font-medium text-ink">
                  Belum ada transaksi yang cocok di halaman ini.
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  Masih ada transaksi lain yang belum dimuat.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => void loadMore()}
                  isLoading={loadingMore}
                  loadingLabel="Memuat transaksi"
                >
                  Muat lebih banyak
                </Button>
              </Card>
            ) : (
              <Card className="text-center">
                <p className="text-[15px] font-medium text-ink">
                  Tidak ada transaksi untuk saringan ini.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRows([]);
                    setNextCursor(null);
                    setFilterLoading(true);
                    setListFilter("all");
                    writeUrl({ view: "active", month: activeMonth, filter: "all" });
                  }}
                  className="mt-4 inline-flex min-h-11 items-center rounded-full border border-blue-border bg-card px-5 text-sm font-semibold text-blue hover:bg-blue-wash"
                >
                  Tampilkan semua
                </button>
              </Card>
            )
          ) : (
            <TransactionList
              rows={visibleRows}
              loading={loading || filterLoading}
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
              onDelete={(row) => setTransactionToDelete(row)}
              onRestore={(row) => void handleRestore(row)}
            />
          )}
        </>
      )}
      </div>

      <AddTransactionSheet open={sheetOpen} onClose={handleSheetClose} onCreated={handleCreated} />

      <TransactionDetailSheet
        row={detail}
        mode={view === "trash" ? "trash" : "active"}
        busy={
          (detail !== null && (deletingId === detail.id || restoringId === detail.id)) || false
        }
        onClose={() => setDetail(null)}
        onUpdate={handleUpdated}
        onDelete={(row) => setTransactionToDelete(row)}
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
      <ConfirmActionDialog
        open={transactionToDelete !== null}
        title="Hapus transaksi?"
        description={transactionToDelete ? `Transaksi ${labelFor(transactionToDelete)} akan dipindahkan ke Trash. Kamu bisa memulihkannya lewat Undo.` : ""}
        confirmLabel="Hapus transaksi"
        busy={deletingId !== null}
        onCancel={() => setTransactionToDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function labelFor(row: TransactionDTO): string {
  const name = row.merchant ?? row.note ?? (isTransferLeg(row) ? "Transfer" : categoryLabel(row.category));
  return `${formatIDR(row.amountMinor)} ${name}`;
}

function filterFromUrl(filter: ActivityTypeFilter): ListFilter {
  if (filter === "in") return "MONEY_IN";
  if (filter === "out") return "MONEY_OUT";
  if (filter === "transfer") return "transfer";
  return "all";
}

function filterToUrl(filter: ListFilter): ActivityTypeFilter {
  if (filter === "MONEY_IN") return "in";
  if (filter === "MONEY_OUT") return "out";
  if (filter === "transfer") return "transfer";
  return "all";
}
