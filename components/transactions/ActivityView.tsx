"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, LayoutGrid, Plus, Search, SlidersHorizontal, Wallet, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonthlyReport, type ReportScope } from "@/components/reports/MonthlyReport";
import { Button } from "@/components/ui/Button";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { Card } from "@/components/ui/Card";
import { useAnimatedClose } from "@/hooks/useAnimatedClose";
import { apiRequest } from "@/lib/api-client";
import { TRANSACTION_ADD_EVENT, setTransactionAddListenerAttached } from "@/lib/transaction-add-intent";
import {
  currentMonthKey,
  formatDateLabel,
  monthKeyLabel,
  monthKeyRange,
  resolveMonthKey,
  todayJakarta,
  toJakartaDateOnly,
} from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDTO, TransactionListDTO, TransactionType, WalletDTO } from "@/types/api";
import { AddTransactionSheet } from "./AddTransactionSheet";
import {
  activityHref,
  activityListUrl,
  type ActivityPeriod,
  type ActivityTypeFilter,
  type ActivityScopeFilter,
  type ActivityViewMode,
} from "./activityUrl";
import {
  filterActivityRows,
  mergeActivityRows,
  shouldOfferLoadMore,
} from "./activityRows";
import { TransactionDetailSheet } from "./TransactionDetailSheet";
import { TransactionList } from "./TransactionList";
import { ActivityMonthSummaryCard } from "./ActivityMonthSummaryCard";
import { UndoToast } from "./UndoToast";
import { CATEGORY_LABELS, categoriesForType, CategoryIcon, categoryLabel, isTransferLeg } from "./categories";

export interface ActivityViewProps {
  initialView: ActivityViewMode;
  /** Validated `YYYY-MM` from the `?month=` deep link; absent = current month. */
  initialMonth?: string;
  /** Active-list period from the `?period=` deep link; absent = month. */
  initialPeriod?: ActivityPeriod;
  /** Free-text search from the `?q=` deep link. */
  initialQ?: string;
  /** Category filters from the repeated `?category=` deep links. */
  initialCategories?: string[];
  /** `?add=1` from the nav/dashboard "Tambah" action opens the add sheet (A-27). */
  initialAdd?: boolean;
  /** `?scan=1` opens the receipt scan tab for the dashboard shortcut. */
  initialScan?: boolean;
  initialTransactionType?: TransactionType;
  initialFrom?: string;
  initialTo?: string;
  initialFilter?: ActivityTypeFilter;
  initialScope?: ActivityScopeFilter;
  /** Active tab wallet filter, or the selected report wallet on Ringkasan. */
  initialWalletId?: string;
  initialWalletIds?: string[];
  initialReportScope?: ReportScope;
  initialReportWalletId?: string;
  initialReportWalletIds?: string[];
  initialData?: TransactionListDTO;
}

type ListFilter = "all" | "MONEY_IN" | "MONEY_OUT" | "transfer";
const FILTER_OPTIONS: ReadonlyArray<readonly [ListFilter, string]> = [
  ["all", "Semua"],
  ["MONEY_IN", "Uang masuk"],
  ["MONEY_OUT", "Uang keluar"],
  ["transfer", "Transfer"],
];

const PERIOD_OPTIONS: ReadonlyArray<readonly [ActivityPeriod, string]> = [
  ["month", "Bulan ini"],
  ["7d", "7 hari"],
  ["30d", "30 hari"],
  ["range", "Rentang"],
];

/* Pure date-key shift: parses an explicit date string, never Date.now(). */
function shiftDateKey(key: string, deltaDays: number): string {
  const base = new Date(`${key}T00:00:00+07:00`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return toJakartaDateOnly(base);
}

/**
 * Activity page: grouped active list with soft delete + 5-second undo, month
 * navigation deep-linked as `?month=YYYY-MM` (server-side filter, A-14), type
 * filters, cursor pagination, a detail sheet, a Trash tab
 * (`/transactions?view=trash`, A-31), and the monthly report view
 * (`?view=ringkasan`, AC-F7-1). Add is an in-page flow, never a nav item.
 * The page passes a key for view + month, so URL-driven view/month changes
 * restart with fresh state; the Add intent is handled separately (AC-F3-14).
 * Report scope and wallet travel in the URL so a month remount restores them.
 */
export function ActivityView({
  initialView,
  initialMonth,
  initialPeriod = "month",
  initialQ = "",
  initialCategories = [],
  initialFrom,
  initialTo,
  initialAdd = false,
  initialScan = false,
  initialTransactionType = "MONEY_OUT",
  initialFilter = "all",
  initialScope = "all",
  initialWalletId,
  initialWalletIds,
  initialReportScope = "all",
  initialReportWalletId,
  initialReportWalletIds,
  initialData,
}: ActivityViewProps) {
  const router = useRouter();
  const [view, setView] = useState<ActivityViewMode>(initialView);
  const [rows, setRows] = useState<TransactionDTO[]>(initialData?.rows ?? []);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionDTO | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [listFilter, setListFilter] = useState<ListFilter>(() => filterFromUrl(initialFilter));
  const [transactionScope, setTransactionScope] = useState<ActivityScopeFilter>(initialScope);
  const [walletIds, setWalletIds] = useState<string[]>(initialWalletIds ?? (initialWalletId ? [initialWalletId] : []));
  const [walletSearch, setWalletSearch] = useState("");
  const [reportScope, setReportScope] = useState<ReportScope>(initialReportScope);
  const [reportWalletIds, setReportWalletIds] = useState<string[]>(initialReportWalletIds ?? (initialReportWalletId ? [initialReportWalletId] : []));
  const [wallets, setWallets] = useState<WalletDTO[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletsError, setWalletsError] = useState<string | null>(null);
  /* Active view is fetched month by month; the month lives in `?month=YYYY-MM`. */
  const [activeMonth, setActiveMonth] = useState<string>(() => resolveMonthKey(initialMonth));
  /* Active list period: "month" follows activeMonth; the others are date windows. */
  const [period, setPeriod] = useState<ActivityPeriod>(initialPeriod);
  /* Captured once so rolling windows stay stable across re-renders. */
  const [today] = useState(() => todayJakarta());
  /* Filter sheet: drafts are edited in the sheet and committed by "Terapkan". */
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const { closing: filterSheetClosing, requestClose: requestFilterClose } = useAnimatedClose(
    () => setFilterSheetOpen(false),
  );
  const [draftPeriod, setDraftPeriod] = useState<ActivityPeriod>(initialPeriod);
  const [draftMonth, setDraftMonth] = useState<string>(() => resolveMonthKey(initialMonth));
  const [draftListFilter, setDraftListFilter] = useState<ListFilter>(() => filterFromUrl(initialFilter));
  const [draftScope, setDraftScope] = useState<ActivityScopeFilter>(initialScope);
  const [draftWalletIds, setDraftWalletIds] = useState<string[]>(initialWalletIds ?? (initialWalletId ? [initialWalletId] : []));
  /* Server-side search across merchant and note, debounced before fetching. */
  const [searchInput, setSearchInput] = useState(initialQ);
  const [appliedQuery, setAppliedQuery] = useState(initialQ);
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [draftCategories, setDraftCategories] = useState<string[]>(initialCategories);
  /* Applied range: drives the fetch and the URL. */
  const [dateFrom, setDateFrom] = useState(initialFrom ?? "");
  const [dateTo, setDateTo] = useState(initialTo ?? "");
  /* Draft range: bound to the inputs, committed only by "Terapkan". */
  const [draftFrom, setDraftFrom] = useState(initialFrom ?? "");
  const [draftTo, setDraftTo] = useState(initialTo ?? "");
  const [dateFilterError, setDateFilterError] = useState<string | null>(null);
  /* Rolling windows derive from today so they can span month boundaries. */
  const periodRange = useMemo(() => {
    if (period === "7d") {
      return { from: shiftDateKey(today, -6), to: today };
    }
    if (period === "30d") {
      return { from: shiftDateKey(today, -29), to: today };
    }
    if (period === "range") {
      const fallback = monthKeyRange(activeMonth);
      return { from: dateFrom || fallback.from, to: dateTo || fallback.to };
    }
    return monthKeyRange(activeMonth);
  }, [period, dateFrom, dateTo, activeMonth, today]);
  const [loading, setLoading] = useState(initialView !== "ringkasan" && !initialData);
  /* Type-filter fetches keep the filter bar mounted so keyboard focus survives. */
  const [filterLoading, setFilterLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [summaryRefreshToken, setSummaryRefreshToken] = useState(0);
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
      period?: ActivityPeriod;
      add?: boolean;
      from?: string;
      to?: string;
      filter?: ListFilter;
      scope?: ActivityScopeFilter;
      q?: string;
      categories?: string[];
      walletId?: string;
      walletIds?: string[];
      reportScope?: ReportScope;
      reportWalletIds?: string[];
    }) => {
      const nextMonth = next.month ?? activeMonth;
      const nextPeriod = next.period ?? period;
      const nextFilter = next.filter ?? listFilter;
      const nextQuery = next.q ?? appliedQuery;
      const nextCategories = next.categories ?? categories;
      const nextTransactionScope = next.scope ?? transactionScope;
      const transactionWalletIds = next.walletIds ??
        (next.walletId !== undefined ? (next.walletId ? [next.walletId] : []) : walletIds);
      const nextScope = next.reportScope ?? reportScope;
      const nextReportWalletIds = next.reportWalletIds ??
        reportWalletIds;
      const nextFrom = next.from ?? dateFrom;
      const nextTo = next.to ?? dateTo;
      router.replace(
        activityHref({
          view: next.view,
          month: nextMonth,
          add: next.add,
          period: nextPeriod,
          from: next.view === "active" && nextPeriod === "range" ? nextFrom : undefined,
          to: next.view === "active" && nextPeriod === "range" ? nextTo : undefined,
          filter: next.view === "active" ? filterToUrl(nextFilter) : "all",
          scope: next.view === "active" ? nextTransactionScope : "all",
          q: next.view === "active" ? nextQuery || undefined : undefined,
          categories: next.view === "active" ? nextCategories : undefined,
          walletId: undefined,
          walletIds: next.view === "active" ? transactionWalletIds : undefined,
          reportWalletIds: next.view === "ringkasan" ? nextReportWalletIds : undefined,
          reportScope: nextScope,
        }),
        { scroll: false },
      );
    },
    [activeMonth, appliedQuery, categories, dateFrom, dateTo, listFilter, period, reportScope, reportWalletIds, router, transactionScope, walletIds],
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

  /* Debounce the search box so typing does not fire a request per keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const lastSyncedQuery = useRef(initialQ);
  useEffect(() => {
    if (lastSyncedQuery.current === appliedQuery) return;
    lastSyncedQuery.current = appliedQuery;
    if (view !== "active") return;
    writeUrl({ view: "active", month: activeMonth });
  }, [appliedQuery, activeMonth, view, writeUrl]);

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
        walletIds,
        from: periodRange.from,
        to: periodRange.to,
        filter: filterToUrl(listFilter),
        scope: transactionScope,
        q: appliedQuery,
        categories,
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
    appliedQuery,
    categories,
    periodRange.from,
    periodRange.to,
    initialData,
    listFilter,
    transactionScope,
    reloadToken,
    router,
    view,
    walletIds,
  ]);

  const reload = () => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  };

  const resetDateFilter = () => {
    setDateFrom("");
    setDateTo("");
    setDraftFrom("");
    setDraftTo("");
    setDateFilterError(null);
  };

  const toggleDraftWallet = (id: string) => {
    setDraftWalletIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const openFilterSheet = () => {
    setDraftPeriod(period);
    setDraftMonth(activeMonth);
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
    setDraftListFilter(listFilter);
    setDraftScope(transactionScope);
    setDraftCategories(categories);
    setDraftWalletIds(walletIds);
    setWalletSearch("");
    setDateFilterError(null);
    setFilterSheetOpen(true);
  };

  const applyFilters = () => {
    let nextFrom = "";
    let nextTo = "";
    if (draftPeriod === "range") {
      if (!draftFrom || !draftTo) {
        setDateFilterError("Isi tanggal mulai dan tanggal akhir.");
        return;
      }
      if (draftFrom > draftTo) {
        setDateFilterError("Tanggal mulai tidak boleh setelah tanggal akhir.");
        return;
      }
      nextFrom = draftFrom;
      nextTo = draftTo;
    }
    /* Drop wallets that are outside the chosen scope before committing. */
    const validWalletIds = draftScope === "all"
      ? draftWalletIds
      : draftWalletIds.filter((id) => wallets.some((wallet) =>
          wallet.id === id && wallet.scope === (draftScope === "personal" ? "PERSONAL" : "SHARING"),
        ));
    /* Drop categories that do not belong to the chosen type. */
    const allowedCategories = categoriesForFilter(draftListFilter);
    const nextCategories = draftCategories.filter((value) => allowedCategories.includes(value));
    setDateFilterError(null);
    setFilterSheetOpen(false);
    setFilterLoading(true);
    setPeriod(draftPeriod);
    setActiveMonth(draftMonth);
    setDateFrom(nextFrom);
    setDateTo(nextTo);
    setListFilter(draftListFilter);
    setTransactionScope(draftScope);
    setCategories(nextCategories);
    setWalletIds(validWalletIds);
    writeUrl({
      view: "active",
      month: draftMonth,
      period: draftPeriod,
      filter: draftListFilter,
      scope: draftScope,
      categories: nextCategories,
      walletIds: validWalletIds,
      from: nextFrom,
      to: nextTo,
    });
  };

  const resetFilters = () => {
    setDraftPeriod("month");
    setDraftMonth(currentMonthKey());
    setDraftFrom("");
    setDraftTo("");
    setDraftListFilter("all");
    setDraftScope("all");
    setDraftCategories([]);
    setDraftWalletIds([]);
    setDateFilterError(null);
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
          walletIds,
          from: periodRange.from,
          to: periodRange.to,
          filter: filterToUrl(listFilter),
          scope: transactionScope,
          q: appliedQuery,
          categories,
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
    setTransactionScope("all");
    setWalletIds([]);
    setDetail(null);
    setFilterSheetOpen(false);
    resetDateFilter();
    setPeriod("month");
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
      period: "month",
      filter: "all",
      scope: "all",
      walletIds: [],
      from: "",
      to: "",
    });
  };

  const openFullReport = () => {
    setView("ringkasan");
    setReportScope(transactionScope);
    setReportWalletIds(walletIds);
    setFilterSheetOpen(false);
    setLoading(false);
    writeUrl({
      view: "ringkasan",
      month: activeMonth,
      reportScope: transactionScope,
      reportWalletIds: walletIds,
    });
  };

  const returnToTransactions = () => {
    setView("active");
    setFilterSheetOpen(false);
    initialDataConsumed.current = true;
    setLoading(true);
    writeUrl({
      view: "active",
      month: activeMonth,
      filter: listFilter,
      scope: transactionScope,
      walletIds,
      from: dateFrom,
      to: dateTo,
    });
  };

  /* Period, scope, and wallets commit together so the URL never holds a mixed state. */
  const changeReportFilter = (next: {
    period: ActivityPeriod;
    month: string;
    from: string;
    to: string;
    scope: ReportScope;
    walletIds: string[];
  }) => {
    setPeriod(next.period);
    setActiveMonth(next.month);
    setDateFrom(next.period === "range" ? next.from : "");
    setDateTo(next.period === "range" ? next.to : "");
    setReportScope(next.scope);
    setReportWalletIds(next.walletIds);
    writeUrl({
      view: "ringkasan",
      month: next.month,
      period: next.period,
      reportScope: next.scope,
      reportWalletIds: next.walletIds,
      from: next.period === "range" ? next.from : "",
      to: next.period === "range" ? next.to : "",
    });
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
      setSummaryRefreshToken((token) => token + 1);
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
        setSummaryRefreshToken((token) => token + 1);
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
      setSummaryRefreshToken((token) => token + 1);
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
    setSummaryRefreshToken((token) => token + 1);
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
    setSummaryRefreshToken((token) => token + 1);
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
      const validWalletIds = walletIds.filter((id) => {
        const wallet = nextWallets.find((candidate) => candidate.id === id);
        return wallet && (transactionScope === "all" ||
          (transactionScope === "personal" && wallet.scope === "PERSONAL") ||
          (transactionScope === "shared" && wallet.scope === "SHARING"));
      });
      if (view === "active" && validWalletIds.length !== walletIds.length) {
        setWalletIds(validWalletIds);
        setLoading(true);
        setReloadToken((token) => token + 1);
        showNotice("Pilihan dompet yang tidak tersedia dihapus.");
        writeUrl({ view: "active", month: activeMonth, walletIds: validWalletIds });
        return;
      }
      if (view !== "ringkasan") return;
      const inScope = nextWallets.filter((wallet) =>
        reportScope === "all" || (reportScope === "shared" ? wallet.scope === "SHARING" : wallet.scope === "PERSONAL"),
      );
      if (reportScope === "personal" && inScope.length === 0) {
        setReportScope("shared");
        const sharedWalletIds = reportWalletIds.filter((id) => nextWallets.some((wallet) => wallet.id === id && wallet.scope === "SHARING"));
        setReportWalletIds(sharedWalletIds);
        writeUrl({
          view: "ringkasan",
          month: activeMonth,
          reportScope: "shared",
          reportWalletIds: sharedWalletIds,
        });
        return;
      }
      const validReportWalletIds = reportWalletIds.filter((id) => inScope.some((wallet) => wallet.id === id));
      if (validReportWalletIds.length !== reportWalletIds.length) {
        setReportWalletIds(validReportWalletIds);
        showNotice("Pilihan dompet yang tidak tersedia dihapus.");
        writeUrl({
          view: "ringkasan",
          month: activeMonth,
          reportScope,
          reportWalletIds: validReportWalletIds,
        });
      }
    };
  });

  const visibleRows = useMemo(
    () => filterActivityRows(rows, filterToUrl(listFilter)),
    [rows, listFilter],
  );

  /*
    Wallets inside the filter sheet follow the DRAFT scope and keep archived
    wallets selectable only when already chosen (AC-F7-8 parity).
  */
  const draftTransactionWallets = wallets.filter((wallet) =>
    (wallet.archivedAt === null || draftWalletIds.includes(wallet.id)) &&
    (draftScope === "all" ||
      (draftScope === "personal" && wallet.scope === "PERSONAL") ||
      (draftScope === "shared" && wallet.scope === "SHARING")),
  );
  const searchedDraftWallets = draftTransactionWallets.filter((wallet) =>
    wallet.name.toLocaleLowerCase("id-ID").includes(walletSearch.trim().toLocaleLowerCase("id-ID")),
  );
  const draftSharedWallets = searchedDraftWallets.filter((wallet) => wallet.scope === "SHARING");
  const draftPersonalWallets = searchedDraftWallets.filter((wallet) => wallet.scope === "PERSONAL");

  const appliedPeriodLabel =
    period === "month"
      ? monthKeyLabel(activeMonth)
      : period === "range" && dateFrom && dateTo
        ? `${formatDateLabel(dateFrom)} sampai ${formatDateLabel(dateTo)}`
        : period === "range"
          ? "Rentang tanggal"
          : period === "7d"
            ? "7 hari terakhir"
            : "30 hari terakhir";
  const filterSummary = [
    appliedPeriodLabel,
    listFilter === "all" ? null : FILTER_OPTIONS.find(([value]) => value === listFilter)?.[1] ?? null,
    categories.length === 0
      ? null
      : categories.length <= 2
        ? categories.map((value) => CATEGORY_LABELS[value] ?? value).join(", ")
        : `${categories.length} kategori`,
    transactionScope === "all" ? null : transactionScope === "personal" ? "Pribadi" : "Bersama",
    walletIds.length > 0 ? `${walletIds.length} dompet` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
  const showFilters = view === "active" && !loading && !error;

  return (
    <div className="space-y-4 md:space-y-5">
      <PageHeader
        className="flex-row flex-wrap items-center justify-between gap-3 print:hidden"
        actionsClassName="ml-auto w-auto flex-row items-center gap-3"
        title={view === "ringkasan" ? "Ringkasan" : "Aktivitas"}
        beforeTitle={view === "ringkasan" ? (
          <button
            type="button"
            onClick={returnToTransactions}
            className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-green hover:bg-mint"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke transaksi
          </button>
        ) : undefined}
        actions={view !== "ringkasan" ? (
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
        ) : undefined}
      />

      {view !== "ringkasan" ? (
        <div
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 print:hidden"
          role="tablist"
          aria-label="Tampilan aktivitas"
        >
          {([
            ["active", "Transaksi"],
            ["trash", "Trash"],
          ] as const).map(([value, label]) => (
          <button
            key={value}
            id={`activity-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={view === value}
            aria-controls={`activity-panel-${value}`}
            onClick={() => changeView(value)}
            className={cn(
              "min-h-11 rounded-xl px-3 text-center text-sm font-semibold transition-colors sm:px-5",
              view === value
                ? "bg-mint text-green"
                : "border border-card-border bg-card text-ink-2 hover:bg-surface-subtle",
            )}
          >
            {label}
          </button>
          ))}
        </div>
      ) : null}

      <div
        id={`activity-panel-${view}`}
        role="tabpanel"
        aria-labelledby={view === "ringkasan" ? "activity-report-title" : `activity-tab-${view}`}
        className="space-y-4 md:space-y-5"
      >
      {view === "ringkasan" ? <h2 id="activity-report-title" className="sr-only">Ringkasan lengkap</h2> : null}
      {view === "active" ? (
        <div className="space-y-2 print:hidden">
          <label className="relative block">
            <span className="sr-only">Cari transaksi</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari nama toko atau catatan"
              className="min-h-12 w-full rounded-2xl border border-card-border bg-card pl-10 pr-4 text-sm text-ink placeholder:text-placeholder shadow-bento focus:border-green focus:outline-none focus:ring-4 focus:ring-green/15"
            />
          </label>
          <button
            type="button"
            onClick={openFilterSheet}
            aria-haspopup="dialog"
            aria-expanded={filterSheetOpen}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-card-border bg-card px-4 text-left shadow-bento transition-colors hover:bg-surface-subtle"
          >
            <span className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-green" aria-hidden="true" />
              <span className="min-w-0 truncate text-sm font-semibold text-ink">{filterSummary}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          </button>
        </div>
      ) : null}


      {view === "active" && period === "month" ? (
        <ActivityMonthSummaryCard
          month={activeMonth}
          scope={transactionScope}
          walletIds={walletIds}
          refreshToken={summaryRefreshToken}
          onOpenReport={openFullReport}
        />
      ) : null}

      {filterSheetOpen ? (
        <div
          className={cn(
            "modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-scrim/35 sm:items-center sm:p-4",
            filterSheetClosing && "modal-closing-overlay",
          )}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) requestFilterClose();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-sheet-title"
            className={cn(
              "max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl",
              filterSheetClosing && "modal-closing-panel",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="filter-sheet-title" className="text-lg font-semibold text-ink">Filter transaksi</h2>
                <p className="mt-1 text-sm text-ink-3">Atur periode, jenis, cakupan, dan dompet.</p>
              </div>
              <button
                type="button"
                onClick={requestFilterClose}
                aria-label="Tutup filter"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-subtle"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <p className="text-sm font-semibold text-ink-2">Periode</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Periode transaksi">
                  {PERIOD_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={draftPeriod === value}
                      onClick={() => {
                        if (value === "range" && !draftFrom && !draftTo) {
                          setDraftFrom(dateFrom || periodRange.from);
                          setDraftTo(dateTo || periodRange.to);
                        }
                        setDraftPeriod(value);
                        setDateFilterError(null);
                      }}
                      className={cn(
                        "min-h-10 rounded-full px-3.5 text-xs font-semibold transition-colors",
                        draftPeriod === value
                          ? "bg-brand-green text-white"
                          : "border border-card-border bg-card text-ink-2 hover:bg-surface-subtle",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {draftPeriod === "month" ? (
                  <label className="mt-3 block text-xs font-semibold text-ink-2">
                    Bulan
                    <input
                      type="month"
                      value={draftMonth}
                      max={currentMonthKey()}
                      onChange={(event) => setDraftMonth(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-input-border bg-card px-3 text-sm text-ink accent-green focus:border-green focus:outline-none focus:ring-4 focus:ring-green/15"
                    />
                  </label>
                ) : null}

                {draftPeriod === "range" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
                      Dari
                      <input
                        type="date"
                        value={draftFrom}
                        max={draftTo || undefined}
                        onChange={(event) => setDraftFrom(event.target.value)}
                        className="min-h-11 w-full min-w-0 rounded-xl border border-input-border px-2 text-sm text-ink focus:border-green focus:outline-none focus:ring-4 focus:ring-green/15"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
                      Sampai
                      <input
                        type="date"
                        value={draftTo}
                        min={draftFrom || undefined}
                        onChange={(event) => setDraftTo(event.target.value)}
                        className="min-h-11 w-full min-w-0 rounded-xl border border-input-border px-2 text-sm text-ink focus:border-green focus:outline-none focus:ring-4 focus:ring-green/15"
                      />
                    </label>
                  </div>
                ) : null}

                {dateFilterError ? (
                  <p role="alert" className="mt-2 text-xs text-danger">{dateFilterError}</p>
                ) : null}
              </div>

              <div>
                <p className="text-sm font-semibold text-ink-2">Jenis transaksi</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Jenis transaksi">
                  {FILTER_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={draftListFilter === value}
                      onClick={() => {
                        setDraftListFilter(value);
                        const allowed = categoriesForFilter(value);
                        setDraftCategories((current) => current.filter((item) => allowed.includes(item)));
                      }}
                      className={cn(
                        "min-h-10 rounded-full px-3.5 text-xs font-semibold transition-colors",
                        draftListFilter === value
                          ? "bg-brand-green text-white"
                          : "border border-card-border bg-card text-ink-2 hover:bg-surface-subtle",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {draftListFilter === "transfer" ? (
                <div>
                  <p className="text-sm font-semibold text-ink-2">Kategori</p>
                  <p className="mt-2 rounded-xl bg-surface-subtle px-3 py-2 text-xs text-ink-3">
                    Transfer tidak punya kategori.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-ink-2">Kategori</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label="Kategori transaksi">
                    <button
                      type="button"
                      aria-pressed={draftCategories.length === 0}
                      onClick={() => setDraftCategories([])}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-colors",
                        draftCategories.length === 0
                          ? "border-brand-green bg-mint text-green"
                          : "border-card-border bg-card text-ink-2 hover:bg-surface-subtle",
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-2">
                        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 truncate">Semua</span>
                    </button>
                    {categoriesForFilter(draftListFilter).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={draftCategories.includes(value)}
                        onClick={() =>
                          setDraftCategories((current) =>
                            current.includes(value)
                              ? current.filter((item) => item !== value)
                              : [...current, value],
                          )
                        }
                        className={cn(
                          "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-colors",
                          draftCategories.includes(value)
                            ? "border-brand-green bg-mint text-green"
                            : "border-card-border bg-card text-ink-2 hover:bg-surface-subtle",
                        )}
                      >
                        <CategoryIcon category={value} size="sm" />
                        <span className="min-w-0 truncate">{CATEGORY_LABELS[value] ?? value}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-ink-2">Cakupan</p>
                <div className="mt-2 flex items-center gap-1 rounded-xl bg-surface-subtle p-1" role="group" aria-label="Cakupan transaksi">
                  {([["all", "Semua"], ["personal", "Pribadi"], ["shared", "Bersama"]] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={draftScope === value}
                      onClick={() => {
                        setDraftScope(value);
                        if (value !== "all") {
                          setDraftWalletIds((current) =>
                            current.filter((id) => wallets.some((wallet) =>
                              wallet.id === id && wallet.scope === (value === "personal" ? "PERSONAL" : "SHARING"),
                            )),
                          );
                        }
                      }}
                      className={cn(
                        "min-h-11 flex-1 rounded-full px-3 text-sm font-semibold transition-colors",
                        draftScope === value ? "bg-card text-ink shadow-sm" : "text-ink-2 hover:bg-card",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-2">Dompet</p>
                  <span className="text-xs font-medium text-ink-3">
                    {draftWalletIds.length ? `${draftWalletIds.length} dipilih` : "Semua dompet"}
                  </span>
                </div>
                <label className="mt-2 block">
                  <span className="sr-only">Cari dompet</span>
                  <input
                    type="search"
                    value={walletSearch}
                    onChange={(event) => setWalletSearch(event.target.value)}
                    placeholder="Cari nama dompet"
                    disabled={walletsLoading || Boolean(walletsError)}
                    className="min-h-11 w-full rounded-xl border border-input-border bg-card px-3 text-sm text-ink placeholder:text-placeholder focus:border-green focus:outline-none focus:ring-4 focus:ring-green/15 disabled:opacity-60"
                  />
                </label>

                {!walletsLoading && !walletsError && draftTransactionWallets.length > 0 ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftWalletIds(draftTransactionWallets.map((wallet) => wallet.id))}
                      className="min-h-9 rounded-full px-2 text-xs font-semibold text-green hover:bg-mint"
                    >
                      Pilih semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftWalletIds([])}
                      className="min-h-9 rounded-full px-2 text-xs font-semibold text-ink-2 hover:bg-surface-subtle"
                    >
                      Kosongkan
                    </button>
                  </div>
                ) : null}

                <div className="mt-2 max-h-56 space-y-2 overflow-y-auto" role="group" aria-label="Daftar dompet">
                  {walletsLoading ? (
                    <p className="px-2 py-3 text-sm text-ink-3">Memuat daftar dompet...</p>
                  ) : walletsError ? (
                    <p className="px-2 py-3 text-sm text-danger">Dompet tidak tersedia.</p>
                  ) : searchedDraftWallets.length ? (
                    [
                      { label: "Bersama", list: draftSharedWallets },
                      { label: "Pribadi", list: draftPersonalWallets },
                    ].map((group) =>
                      group.list.length ? (
                        <div key={group.label} className="space-y-1">
                          <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                            {group.label}
                          </p>
                          {group.list.map((wallet) => {
                            const checked = draftWalletIds.includes(wallet.id);
                            return (
                              <button
                                key={wallet.id}
                                type="button"
                                aria-pressed={checked}
                                onClick={() => toggleDraftWallet(wallet.id)}
                                className={cn(
                                  "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm transition-colors",
                                  checked
                                    ? "border-brand-green bg-mint text-green"
                                    : "border-card-border bg-card text-ink hover:bg-surface-subtle",
                                )}
                              >
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-ink-2"
                                  aria-hidden="true"
                                >
                                  <Wallet className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1 truncate font-semibold">{wallet.name}</span>
                                {wallet.archivedAt ? (
                                  <span className="shrink-0 rounded-full bg-chip-slate px-2 py-0.5 text-[10px] font-semibold text-ink-2">
                                    Arsip
                                  </span>
                                ) : null}
                                <span
                                  className={cn(
                                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                                    checked ? "border-brand-green bg-brand-green text-white" : "border-input-border",
                                  )}
                                  aria-hidden="true"
                                >
                                  {checked ? <Check className="h-3 w-3" /> : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null,
                    )
                  ) : (
                    <p className="px-2 py-3 text-sm text-ink-3">
                      {draftTransactionWallets.length ? "Tidak ada dompet yang cocok." : "Belum ada dompet untuk cakupan ini."}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-11 rounded-full border border-card-border px-4 text-sm font-semibold text-ink-2 hover:bg-surface-subtle"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="min-h-11 rounded-full bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-hover"
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
          walletIds={reportWalletIds}
          period={period}
          from={periodRange.from}
          to={periodRange.to}
          onFilterChange={changeReportFilter}
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
                  className="mt-4 inline-flex min-h-11 items-center rounded-full border border-success-border bg-card px-5 text-sm font-semibold text-green hover:bg-mint"
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

      <AddTransactionSheet open={sheetOpen} initialMode={initialScan ? "scan" : "manual"} initialType={initialTransactionType} onClose={handleSheetClose} onCreated={handleCreated} />

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

/*
  Category options follow the same per-type vocabulary as the entry form
  (categoriesForType). Transfer has no category, so its list is empty.
*/
function categoriesForFilter(filter: ListFilter): readonly string[] {
  if (filter === "MONEY_IN") return categoriesForType("MONEY_IN");
  if (filter === "MONEY_OUT") return categoriesForType("MONEY_OUT");
  if (filter === "transfer") return [];
  return Object.keys(CATEGORY_LABELS);
}
