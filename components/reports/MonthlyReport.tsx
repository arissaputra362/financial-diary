"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, FileDown, Search, SlidersHorizontal, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAnimatedClose } from "@/hooks/useAnimatedClose";
import { apiRequest } from "@/lib/api-client";
import { openPdfBlob } from "@/lib/pdf-download";
import { currentMonthKey, formatDateLabel, monthKeyLabel, todayJakarta, toJakartaDateOnly } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  MonthlyReportDTO,
  ReportBreakdownDTO,
  TransactionDTO,
  TransactionListDTO,
  WalletDTO,
} from "@/types/api";
import { activityHref, activityListUrl, type ActivityPeriod } from "../transactions/activityUrl";
import { BalanceMovementChart } from "./BalanceMovementChart";
import { CategoryBreakdownList, CategoryDonutChart } from "./CategoryDonutChart";
import {
  buildReportHistoricalLedger,
  canOfferPrint,
  collectReportDetailRows,
  type ReportLedgerRow,
} from "./reportDetail";

export type ReportScope = "all" | "shared" | "personal";

export interface MonthlyReportProps {
  month: string;
  wallets: WalletDTO[];
  walletsLoading: boolean;
  walletsError: string | null;
  scope: ReportScope;
  walletIds: string[];
  period: ActivityPeriod;
  /** Resolved range start/end for non-month periods. */
  from: string;
  to: string;
  onFilterChange: (next: {
    period: ActivityPeriod;
    month: string;
    from: string;
    to: string;
    scope: ReportScope;
    walletIds: string[];
  }) => void;
}

const longDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function longDate(value: string): string {
  const date = new Date(`${value}T12:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? value : longDateFormatter.format(date);
}

const PERIOD_OPTIONS: ReadonlyArray<readonly [ActivityPeriod, string]> = [
  ["month", "Bulan ini"],
  ["7d", "7 hari"],
  ["30d", "30 hari"],
  ["range", "Rentang"],
];

function shiftDateKey(key: string, deltaDays: number): string {
  const base = new Date(`${key}T00:00:00+07:00`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return toJakartaDateOnly(base);
}

function scopeWallets(wallets: WalletDTO[], scope: ReportScope): WalletDTO[] {
  if (scope === "all") return wallets;
  const wanted = scope === "shared" ? "SHARING" : "PERSONAL";
  /* Archived wallets stay selectable: archive is not deletion (AC-F7-8). */
  return wallets.filter((wallet) => wallet.scope === wanted);
}

export function MonthlyReport({
  month,
  wallets,
  walletsLoading,
  walletsError,
  scope,
  walletIds,
  period,
  from,
  to,
  onFilterChange,
}: MonthlyReportProps) {
  const router = useRouter();
  const [result, setResult] = useState<{
    key: string;
    data: MonthlyReportDTO | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [walletSearch, setWalletSearch] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const { closing: filterSheetClosing, requestClose: requestFilterClose } = useAnimatedClose(
    () => setFilterSheetOpen(false),
  );
  const [draftScope, setDraftScope] = useState<ReportScope>(scope);
  const [draftWalletIds, setDraftWalletIds] = useState<string[]>(walletIds);
  const [draftPeriod, setDraftPeriod] = useState<ActivityPeriod>(period);
  const [draftMonth, setDraftMonth] = useState<string>(month);
  const [draftFrom, setDraftFrom] = useState<string>(from);
  const [draftTo, setDraftTo] = useState<string>(to);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [printRun, setPrintRun] = useState<{
    key: string;
    report: MonthlyReportDTO;
    status: "preparing" | "error" | "ready";
    rows: TransactionDTO[];
  } | null>(null);
  const printAbortRef = useRef<AbortController | null>(null);

  const available = scopeWallets(wallets, scope);
  const hasPersonalWallet = wallets.some((wallet) => wallet.scope === "PERSONAL");
  const personalUnavailable = !walletsLoading && !walletsError && !hasPersonalWallet;
  const selectedWallets = available.filter((wallet) => walletIds.includes(wallet.id));
  const draftAvailable = scopeWallets(wallets, draftScope);
  const searchedDraftWallets = draftAvailable.filter((wallet) =>
    wallet.name.toLocaleLowerCase("id-ID").includes(walletSearch.trim().toLocaleLowerCase("id-ID")),
  );
  const draftSharedWallets = searchedDraftWallets.filter((wallet) => wallet.scope === "SHARING");
  const draftPersonalWallets = searchedDraftWallets.filter((wallet) => wallet.scope === "PERSONAL");
  const periodLabel =
    period === "month"
      ? monthKeyLabel(month)
      : period === "7d"
        ? "7 hari terakhir"
        : period === "30d"
          ? "30 hari terakhir"
          : from && to
            ? `${formatDateLabel(from)} sampai ${formatDateLabel(to)}`
            : "Rentang tanggal";
  const scopeSummary = scope === "all" ? "Semua" : scope === "shared" ? "Bersama" : "Pribadi";
  const walletSummary = walletIds.length
    ? `${walletIds.length} dompet`
    : `Semua dompet (${available.length})`;
  const filterSummary = `${periodLabel} · ${scopeSummary} · ${walletSummary}`;

  const toggleDraftWallet = (id: string) => {
    setDraftWalletIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const chooseDraftScope = (next: ReportScope) => {
    setDraftScope(next);
    if (next !== "all") {
      setDraftWalletIds((current) =>
        current.filter((id) => wallets.some((wallet) =>
          wallet.id === id && wallet.scope === (next === "shared" ? "SHARING" : "PERSONAL"),
        )),
      );
    }
  };

  const openFilterSheet = () => {
    setDraftScope(scope);
    setDraftWalletIds(walletIds);
    setDraftPeriod(period);
    setDraftMonth(month);
    setDraftFrom(from);
    setDraftTo(to);
    setFilterError(null);
    setWalletSearch("");
    setFilterSheetOpen(true);
  };

  const applyReportFilter = () => {
    let nextFrom = "";
    let nextTo = "";
    if (draftPeriod === "7d" || draftPeriod === "30d") {
      const days = draftPeriod === "7d" ? 6 : 29;
      nextTo = todayJakarta();
      nextFrom = shiftDateKey(nextTo, -days);
    } else if (draftPeriod === "range") {
      if (!draftFrom || !draftTo) {
        setFilterError("Isi tanggal mulai dan tanggal akhir.");
        return;
      }
      if (draftFrom > draftTo) {
        setFilterError("Tanggal mulai tidak boleh setelah tanggal akhir.");
        return;
      }
      nextFrom = draftFrom;
      nextTo = draftTo;
    }
    const validWalletIds = draftScope === "all"
      ? draftWalletIds
      : draftWalletIds.filter((id) => draftAvailable.some((wallet) => wallet.id === id));
    onFilterChange({
      period: draftPeriod,
      month: draftMonth,
      from: nextFrom,
      to: nextTo,
      scope: draftScope,
      walletIds: validWalletIds,
    });
    setFilterSheetOpen(false);
  };
  /*
    Never request a scope or wallet the selector cannot represent. The parent
    resets both from the URL; until then the report keeps its loading shape
    instead of rendering a misleading empty or error result.
  */
  const waitingForScope = walletsLoading ||
    (scope === "personal" && personalUnavailable) ||
    (walletIds.length > 0 && !walletsError && selectedWallets.length !== walletIds.length);
  const requestKey = `${period}|${month}|${from}|${to}|${scope}|${walletIds.join(",")}|${reloadToken}`;
  const printKey = `${period}|${month}|${from}|${to}|${scope}|${walletIds.join(",")}`;
  const printKeyRef = useRef(printKey);
  const loading = result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;

  useEffect(() => {
    if (waitingForScope) return;
    let active = true;
    const controller = new AbortController();

    const params = new URLSearchParams({ scope });
    if (period !== "month" && from && to) {
      params.set("from", from);
      params.set("to", to);
    } else {
      params.set("month", month);
    }
    walletIds.forEach((id) => params.append("walletId", id));
    apiRequest<MonthlyReportDTO>(`/api/reports/monthly?${params.toString()}`, { signal: controller.signal })
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
        if (!response.ok || !response.data) {
          setResult({
            key: requestKey,
            data: null,
            error: response.data?.error?.message ?? "Laporan belum bisa dimuat.",
          });
          return;
        }
        setResult({ key: requestKey, data: response.data, error: null });
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setResult({ key: requestKey, data: null, error: "Laporan belum bisa dimuat." });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [from, month, period, requestKey, router, scope, to, waitingForScope, walletIds]);

  /*
    A PDF run belongs to one month + scope + wallet combination. Changing any of
    them discards the rows and aborts an in-flight page loop (AC-F7-17), so a
    stale ledger can never be exported for the combination on screen.
  */
  useEffect(() => {
    printKeyRef.current = printKey;
    printAbortRef.current?.abort();
  }, [printKey]);

  useEffect(
    () => () => {
      printAbortRef.current?.abort();
    },
    [],
  );

  const showLoading = loading || waitingForScope;
  const canPrint = canOfferPrint({
    loading: showLoading,
    error: Boolean(error),
    transactionCount: data?.transactionCount ?? null,
  });
  /*
    Bind a print run to the exact report object it was prepared from, so stale
    rows never reappear after returning to an old month/scope/wallet.
  */
  const currentPrint =
    printRun && printRun.key === printKey && printRun.report === data ? printRun : null;
  const preparing = currentPrint?.status === "preparing";
  const printFailed = currentPrint?.status === "error";
  const historicalLedger =
    data && currentPrint?.status === "ready"
      ? buildReportHistoricalLedger(
          currentPrint.rows,
          scope,
          data,
          walletIds.length ? selectedWallets : available,
        )
      : null;

  const prepareLedger = async (exportAfter = false) => {
    if (preparing || !data) return;
    const key = printKey;
    setPrintRun({ key, report: data, status: "preparing", rows: [] });
    printAbortRef.current?.abort();
    const controller = new AbortController();
    printAbortRef.current = controller;

    let rows: TransactionDTO[] = [];
    try {
      rows = await collectReportDetailRows(async (cursor) => {
        const response = await apiRequest<TransactionListDTO>(
          activityListUrl({
            view: "active",
            month,
            walletIds,
            scope,
            cursor,
          }),
          { signal: controller.signal },
        );
        if (response.status === 401) {
          router.push("/login");
          throw new Error("Sesi berakhir.");
        }
        if (response.status === 403) {
          router.push("/waiting-for-approval");
          throw new Error("Akses ditolak.");
        }
        if (!response.ok || !response.data) {
          throw new Error("Detail transaksi belum bisa disiapkan.");
        }
        return response.data;
      });
    } catch {
      if (!controller.signal.aborted && printKeyRef.current === key) {
        setPrintRun({ key, report: data, status: "error", rows: [] });
      }
      return;
    } finally {
      if (printAbortRef.current === controller) printAbortRef.current = null;
    }

    if (controller.signal.aborted || printKeyRef.current !== key) return;

    if (rows.length === 0) {
      setPrintRun({ key, report: data, status: "error", rows: [] });
      return;
    }

    setPrintRun({ key, report: data, status: "ready", rows });

    if (exportAfter) {
      await exportPdf({
        report: data,
        ledger: buildReportHistoricalLedger(
          rows,
          scope,
          data,
          walletIds.length ? selectedWallets : available,
        ),
      });
    }
  };

  /*
    Build a vector PDF in the browser so mobile can open or share the file
    directly. Page 1 is the A4 summary; the transaction ledger follows on the
    next pages, so nothing is sliced or cut off at the page edge.
  */
  const exportPdf = async (payload?: {
    report: MonthlyReportDTO;
    ledger: ReportLedgerRow[];
  }) => {
    const report = payload?.report ?? data;
    const ledger = payload?.ledger ?? historicalLedger;
    if (!report || !ledger || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const { createReportPdf } = await import("./report-pdf");
      const scopeLabel = scope === "all" ? "Semua" : scope === "shared" ? "Bersama" : "Pribadi";
      const walletLabel =
        report.wallet?.name ??
        (walletIds.length
          ? selectedWallets.map((wallet) => wallet.name).join(", ")
          : "Semua dompet");
      const { blob, filename } = createReportPdf({
        report,
        ledger,
        periodLabel,
        scopeLabel,
        walletLabel,
      });
      await openPdfBlob(blob, filename);
    } catch (error) {
      if ((error as DOMException | undefined)?.name !== "AbortError") {
        setExportError("PDF belum bisa dibuat. Coba lagi.");
      }
    } finally {
      setExporting(false);
    }
  };

  /* One click: prepare the detail rows, then build and open the PDF. */
  const handleExportClick = () => {
    if (preparing || exporting) return;
    if (currentPrint?.status === "ready" && historicalLedger) {
      void exportPdf();
      return;
    }
    void prepareLedger(true);
  };

  return (
    <section aria-label="Laporan bulanan" className="space-y-5">
      <div className="space-y-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openFilterSheet}
            aria-haspopup="dialog"
            aria-expanded={filterSheetOpen}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-card-border bg-card px-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-surface-subtle sm:max-w-md sm:flex-none"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-green" aria-hidden="true" />
            <span className="min-w-0 truncate">{filterSummary}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          </button>

          {canPrint ? (
            <button
              type="button"
              onClick={handleExportClick}
              disabled={preparing || exporting}
              aria-busy={preparing || exporting || undefined}
              className="ml-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-hover disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-52"
            >
              <FileDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              {preparing || exporting ? "Menyiapkan PDF..." : "Buka PDF"}
            </button>
          ) : null}
        </div>
        {printFailed ? (
          <p role="status" className="text-xs text-danger">
            PDF belum bisa disiapkan.{" "}
            <button
              type="button"
              onClick={() => void prepareLedger(true)}
              className="min-h-11 rounded-full px-2 text-sm font-semibold text-green hover:bg-mint"
            >
              Coba lagi
            </button>
          </p>
        ) : null}
        {exportError ? (
          <p role="status" className="text-xs text-danger">{exportError}</p>
        ) : null}
        {personalUnavailable ? (
          <p className="text-xs text-ink-3">Kamu belum punya dompet pribadi.</p>
        ) : null}
        {walletsError ? (
          <p role="status" className="text-xs text-danger">
            {walletsError}
          </p>
        ) : null}
      </div>

      {filterSheetOpen ? (
        <div
          className={cn(
            "modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-scrim/35 sm:items-center sm:p-4 print:hidden",
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
            aria-labelledby="report-filter-title"
            className={cn(
              "max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl",
              filterSheetClosing && "modal-closing-panel",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="report-filter-title" className="text-lg font-semibold text-ink">Filter ringkasan</h2>
                <p className="mt-1 text-sm text-ink-3">Pilih cakupan dan dompet yang dihitung di laporan ini.</p>
              </div>
              <button
                type="button"
                onClick={requestFilterClose}
                aria-label="Tutup filter ringkasan"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-subtle"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5">
              <p className="text-sm font-semibold text-ink-2">Periode</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Periode laporan">
                {PERIOD_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draftPeriod === value}
                    onClick={() => {
                      setDraftPeriod(value);
                      if (value === "range" && !draftFrom && !draftTo) {
                        const today = todayJakarta();
                        setDraftFrom(shiftDateKey(today, -29));
                        setDraftTo(today);
                      }
                      setFilterError(null);
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

              {filterError ? (
                <p role="alert" className="mt-2 text-xs text-danger">{filterError}</p>
              ) : null}
            </div>

            <div className="mt-5">
              <p className="text-sm font-semibold text-ink-2">Cakupan</p>
              <div className="mt-2 flex items-center gap-1 rounded-xl bg-surface-subtle p-1" role="group" aria-label="Cakupan laporan">
                {([
                  ["all", "Semua"],
                  ["personal", "Pribadi"],
                  ["shared", "Bersama"],
                ] as const).map(([value, label]) => {
                  const disabled = value === "personal" && personalUnavailable;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={draftScope === value}
                      disabled={disabled}
                      onClick={() => chooseDraftScope(value)}
                      className={cn(
                        "min-h-11 flex-1 rounded-full px-3 text-sm font-semibold transition-colors",
                        draftScope === value ? "bg-card text-ink shadow-sm" : "text-ink-2 hover:bg-card",
                        disabled && "cursor-not-allowed text-ink-3 hover:bg-transparent",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {personalUnavailable ? (
                <p className="mt-1 text-xs text-ink-3">Kamu belum punya dompet pribadi.</p>
              ) : null}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-2">Dompet</p>
                <span className="text-xs font-medium text-ink-3">
                  {draftWalletIds.length ? `${draftWalletIds.length} dipilih` : "Semua dompet"}
                </span>
              </div>
              <label className="relative mt-2 block">
                <span className="sr-only">Cari dompet laporan</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={walletSearch}
                  onChange={(event) => setWalletSearch(event.target.value)}
                  placeholder="Cari nama dompet"
                  disabled={walletsLoading || Boolean(walletsError)}
                  className="min-h-11 w-full rounded-xl border border-input-border bg-card pl-10 pr-3 text-sm text-ink placeholder:text-placeholder focus:border-green focus:outline-none focus:ring-4 focus:ring-green/15 disabled:opacity-60"
                />
              </label>

              {!walletsLoading && !walletsError && draftAvailable.length > 0 ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftWalletIds(draftAvailable.map((wallet) => wallet.id))}
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

              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto" role="group" aria-label="Daftar dompet laporan">
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
                    {draftAvailable.length ? "Tidak ada dompet yang cocok." : "Belum ada dompet untuk cakupan ini."}
                  </p>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-3">
                Transfer antar-dompet yang seluruh sisinya ada di pilihan tidak masuk ke pemasukan atau pengeluaran.
              </p>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={requestFilterClose}
                className="min-h-11 rounded-full border border-card-border px-4 text-sm font-semibold text-ink-2 hover:bg-surface-subtle"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={applyReportFilter}
                className="min-h-11 rounded-full bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-hover"
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLoading ? (
        <ReportSkeleton />
      ) : error || !data ? (
        <Card variant="danger" className="text-center print:hidden">
          <p className="text-lg font-semibold text-danger">Laporan belum bisa dimuat.</p>
          <p className="mt-1 text-sm text-danger">
            Kendala jaringan menghentikan pengambilan data.
          </p>
          <Button className="mt-4" onClick={() => setReloadToken((token) => token + 1)}>
            Coba lagi
          </Button>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="space-y-5 print:space-y-2 print:break-after-page">
            <h2 className="hidden text-2xl font-bold tracking-tight text-ink print:mb-1 print:block print:text-xl">
              Laporan {periodLabel}
            </h2>
            <BalanceCard report={data} periodLabel={periodLabel} />
            <MovementTrace report={data} hasWalletSelection={walletIds.length > 0} />
            {data.transactionCount === 0 ? (
              <Card className="text-center print:hidden">
                <p className="text-[15px] font-medium text-ink">
                  {data.wallet
                    ? `Belum ada transaksi pada dompet ${data.wallet.name} untuk ${periodLabel}.`
                    : `Belum ada transaksi pada ${periodLabel}.`}
                </p>
              </Card>
            ) : (
              <div className="grid gap-5 lg:grid-cols-3 print:grid-cols-2 print:gap-2">
                <BreakdownCard
                  className="lg:col-span-2"
                  chart="donut"
                  title="Pengeluaran"
                  type="expense"
                  breakdown={data.expense}
                  delta={data.delta.moneyOutMinor}
                  monthLabel={periodLabel}
                  actionHref={activityHref({
                    view: "active",
                    month,
                    filter: "out",
                    scope,
                    walletIds,
                  })}
                  actionLabel="Lihat semua pengeluaran"
                />
                <BreakdownCard
                  chart="list"
                  title="Pemasukan"
                  type="income"
                  breakdown={data.income}
                  delta={data.delta.moneyInMinor}
                  monthLabel={periodLabel}
                  actionHref={activityHref({
                    view: "active",
                    month,
                    filter: "in",
                    scope,
                    walletIds,
                  })}
                />
              </div>
            )}
            <BalanceMovementChart
              key={`${month}-${scope}-${walletIds.join(",") || "all"}`}
              data={data.dailyBalances}
              monthLabel={periodLabel}
              isCurrentMonth={data.isCurrentMonth}
              scopeLabel={scope === "all" ? "semua" : scope === "shared" ? "bersama" : "pribadi"}
            />
            <ReportFootnotes report={data} scope={scope} walletLabel={walletIds.length ? selectedWallets.map((wallet) => wallet.name).join(", ") : "Semua dompet"} />
          </div>
        </div>
      )}
    </section>
  );
}

function DeltaLine({
  amountMinor,
  className,
}: {
  amountMinor: number | null;
  className?: string;
}) {
  if (amountMinor === null) return null;
  const direction = amountMinor < 0 ? "Turun" : "Naik";
  return (
    <p className={cn("tabular-nums", className)}>
      {direction} <span className="font-semibold">{formatIDR(Math.abs(amountMinor))}</span> dari
      bulan lalu
    </p>
  );
}

function BalanceCard({ report, periodLabel }: { report: MonthlyReportDTO; periodLabel: string }) {
  const label = `Ringkasan ${periodLabel}`;
  return (
    <section
      aria-label={`Ringkasan ${periodLabel}`}
      className="relative w-full overflow-hidden rounded-feature surface-hero p-5 text-white shadow-bento sm:p-6 print:break-inside-avoid print:p-3"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90 print:text-[8pt]">{label}</p>
      <p className="mt-2 text-xs font-medium text-white/85 print:mt-0.5 print:text-[7pt]">Pengeluaran</p>
      <p className="financial-value mt-0.5 whitespace-nowrap text-[clamp(1.6rem,7vw,2.5rem)] font-bold tracking-tight print:text-2xl">
        {formatIDR(report.moneyOutMinor)}
      </p>
      <DeltaLine amountMinor={report.delta.moneyOutMinor} className="mt-2 text-xs text-white/85 print:mt-0.5 print:text-[8pt]" />

      <div className="mt-4 grid grid-cols-2 gap-2 print:mt-2 print:gap-1">
        <div className="min-w-0 rounded-2xl bg-black/15 p-3 print:bg-white/10 print:p-1.5">
          <p className="text-[11px] font-medium text-white/85 print:text-[7pt]">Pemasukan</p>
          <p className="financial-value mt-1 truncate text-lg font-bold tabular-nums print:mt-0.5 print:text-xs">
            {formatIDR(report.moneyInMinor)}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-black/15 p-3 print:bg-white/10 print:p-1.5">
          <p className="text-[11px] font-medium text-white/85 print:text-[7pt]">Sisa akhir</p>
          <p className="financial-value mt-1 truncate text-lg font-bold tabular-nums print:mt-0.5 print:text-xs">
            {formatIDR(report.closingMinor)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/85 print:mt-1 print:text-[7pt]">
        Dari {report.transactionCount} transaksi, {longDate(report.periodStart)} sampai {longDate(report.periodEnd)}.
      </p>
    </section>
  );
}

function MovementTrace({ report, hasWalletSelection }: { report: MonthlyReportDTO; hasWalletSelection: boolean }) {
  const hasNewWallet = report.newWalletOpeningMinor !== 0;
  const hasTransferIn = report.transferInMinor !== 0;
  const hasTransferOut = report.transferOutMinor !== 0;
  const hasTransfer = hasTransferIn || hasTransferOut;

  return (
    <Card className="p-5 sm:p-6 print:break-inside-avoid print:p-3">
      <h2 className="text-lg font-semibold text-ink print:text-sm">Jejak saldo</h2>
      <dl className="mt-3 divide-y divide-row-divider">
        <TraceRow label="Saldo awal" value={report.openingMinor} />
        {hasNewWallet ? (
          <TraceRow
            label="Saldo awal dompet baru"
            value={report.newWalletOpeningMinor}
            sign="+"
          />
        ) : null}
        <TraceRow label="Masuk" value={report.moneyInMinor} sign="+" />
        {hasTransferIn ? (
          <TraceRow label="Transfer masuk (antar dompet)" value={report.transferInMinor} sign="+" />
        ) : null}
        <TraceRow label="Keluar" value={report.moneyOutMinor} sign="−" />
        {hasTransferOut ? (
          <TraceRow label="Transfer keluar (antar dompet)" value={report.transferOutMinor} sign="−" />
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t-2 border-card-border bg-surface-subtle px-3 py-3 print:px-2 print:py-1.5">
          <dt className="text-sm font-bold text-ink">Saldo akhir</dt>
          <dd className="whitespace-nowrap text-xl font-bold tabular-nums text-ink print:text-base">
            {formatIDR(report.closingMinor)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-ink-3 print:mt-2 print:text-[7pt]">
        Saldo akhir adalah hasil penambahan dan pengurangan di atas.
      </p>
      {hasTransfer ? (
        <p className="mt-1 text-xs text-ink-3 print:text-[7pt]">
          {hasWalletSelection
            ? "Transfer antar-dompet yang seluruh sisinya ada di pilihan saling meniadakan. Jika dompet pasangan tidak dipilih, nilainya dihitung sebagai masuk atau keluar sesuai sisi dompet yang dipilih."
            : report.scope === "ALL"
              ? "Transfer antar-dompet yang kedua sisinya dapat diakses saling meniadakan. Transfer dengan sisi pasangan di luar akses hanya menampilkan sisi yang dapat diakses."
              : `Transfer antar-dompet dalam cakupan ${report.scope === "SHARED" ? "Bersama" : "Pribadi"} saling meniadakan. Transfer dengan sisi pasangan di cakupan lain dihitung pada sisi ${report.scope === "SHARED" ? "Bersama" : "Pribadi"} yang terlihat.`}
        </p>
      ) : null}
    </Card>
  );
}

function TraceRow({
  label,
  value,
  sign = "",
}: {
  label: string;
  value: number;
  sign?: "+" | "−" | "";
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 print:px-2 print:py-1">
      <dt className="min-w-0 text-sm text-ink-2 print:text-[8pt]">{label}</dt>
      <dd className="whitespace-nowrap text-base font-semibold tabular-nums text-ink print:text-[9pt]">
        {sign ? `${sign} ` : ""}
        {formatIDR(value)}
      </dd>
    </div>
  );
}

function BreakdownCard({
  title,
  type,
  breakdown,
  delta,
  monthLabel,
  actionHref,
  actionLabel,
  chart = "donut",
  className,
}: {
  title: "Pemasukan" | "Pengeluaran";
  type: "income" | "expense";
  breakdown: ReportBreakdownDTO;
  delta: number | null;
  monthLabel: string;
  actionHref?: string;
  actionLabel?: "Lihat semua pemasukan" | "Lihat semua pengeluaran";
  /** Expense uses the donut; income uses a compact list to avoid two donuts. */
  chart?: "donut" | "list";
  className?: string;
}) {
  const income = type === "income";
  const emptyCopy = income
    ? `Belum ada pemasukan pada ${monthLabel}.`
    : `Belum ada pengeluaran pada ${monthLabel}.`;

  return (
    <Card className={cn("flex flex-col p-5 sm:p-6 print:break-inside-avoid print:p-3", className)}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full print:h-7 print:w-7",
            income ? "bg-mint text-green" : "bg-danger-bg text-danger",
          )}
          aria-hidden="true"
        >
          {income ? (
            <ArrowDownLeft className="h-5 w-5" />
          ) : (
            <ArrowUpRight className="h-5 w-5" />
          )}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-2 print:text-[8pt]">{title}</p>
      </div>

      <p
        className={cn(
          "mt-3 whitespace-nowrap text-2xl font-semibold tabular-nums print:mt-1 print:text-lg",
          income ? "text-green" : "text-danger",
        )}
      >
        {formatIDR(breakdown.totalMinor)}
      </p>
      <DeltaLine amountMinor={delta} className="mt-1 text-xs text-ink-2 print:text-[7pt]" />

      {breakdown.totalMinor === 0 &&
      breakdown.categories.length === 0 &&
      breakdown.uncategorizedMinor === 0 &&
      breakdown.otherCategoryCount === 0 ? (
        <p className="mt-4 text-sm text-ink-3 print:mt-2 print:text-[8pt]">{emptyCopy}</p>
      ) : (
        chart === "donut" ? (
          <CategoryDonutChart title={title} breakdown={breakdown} />
        ) : (
          <CategoryBreakdownList breakdown={breakdown} />
        )
      )}

      <div className="mt-auto pt-4 print:pt-2">
        <div className="flex items-baseline justify-between gap-3 border-t border-row-divider pt-3 print:pt-1.5">
          <span className="text-sm font-semibold text-ink-2">Subtotal</span>
          <span
            className={cn(
              "whitespace-nowrap text-base font-bold tabular-nums print:text-sm",
              income ? "text-green" : "text-danger",
            )}
          >
            {formatIDR(breakdown.totalMinor)}
          </span>
        </div>
      </div>

      {actionHref ? (
        <Link
          href={actionHref}
          className="mt-2 inline-flex min-h-11 items-center self-start rounded-full px-4 text-sm font-semibold text-green hover:bg-mint print:hidden"
        >
          {actionLabel ?? (income ? "Lihat semua pemasukan" : "Lihat semua pengeluaran")}
        </Link>
      ) : null}
    </Card>
  );
}

function ReportFootnotes({
  report,
  scope,
  walletLabel,
}: {
  report: MonthlyReportDTO;
  scope: ReportScope;
  walletLabel: string;
}) {
  return (
    <div className="space-y-1 px-1 text-xs text-ink-3 print:break-inside-avoid print:space-y-0 print:text-[7pt]">
      <p>
        Dihitung dari {report.transactionCount} transaksi, {longDate(report.periodStart)} sampai{" "}
        {longDate(report.periodEnd)}.
      </p>
      <p>Transfer dengan kedua dompet tercakup dalam pilihan tidak mengubah saldo gabungan. Jika dompet pasangan di luar pilihan, transfer dihitung sesuai arahnya.</p>
      <p>
        Cakupan: {scope === "all" ? "Semua" : scope === "shared" ? "Bersama" : "Pribadi"}, {walletLabel}.
      </p>
      {report.hasBackdatedNewWallet ? (
        <p>Ada dompet yang dibuat belakangan dan memiliki transaksi bertanggal lebih awal.</p>
      ) : null}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Memuat laporan bulanan">
      <Card className="surface-hero p-6 sm:max-w-2xl sm:p-8">
        <Skeleton className="h-3 w-2/5 bg-white/10" />
        <Skeleton className="mt-3 h-10 w-3/5 bg-white/10" />
        <Skeleton className="mt-3 h-3 w-1/2 bg-white/10" />
      </Card>
      <Card className="p-5 sm:p-6">
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((cell) => (
            <div key={cell} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-28 max-w-full" />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((card) => (
          <Card key={card} className="space-y-3 p-5 sm:p-6">
            <Skeleton className="h-11 w-11 rounded-full" />
            <Skeleton className="h-7 w-40 max-w-full" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </Card>
        ))}
      </div>
      <Card className="p-5 sm:p-6">
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-6 h-40 w-full sm:h-56" />
      </Card>
    </div>
  );
}
