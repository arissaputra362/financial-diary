"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiRequest } from "@/lib/api-client";
import { monthKeyLabel } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  MonthlyReportDTO,
  ReportBreakdownDTO,
  TransactionDTO,
  TransactionListDTO,
  WalletDTO,
} from "@/types/api";
import { activityHref, activityListUrl } from "../transactions/activityUrl";
import { BalanceMovementChart } from "./BalanceMovementChart";
import { CategoryDonutChart } from "./CategoryDonutChart";
import { GoldReportSection } from "./GoldReportSection";
import {
  buildReportHistoricalLedger,
  canOfferPrint,
  collectReportDetailRows,
  formatReportDetailDate,
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
  onScopeChange: (scope: ReportScope) => void;
  onWalletChange: (walletIds: string[]) => void;
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

/** "Oktober 2026" -> "Oktober" for the adaptive hero label (AC-F7-3). */
function monthNameOnly(month: string): string {
  return monthKeyLabel(month).replace(/\s+\d{4}$/, "");
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
  onScopeChange,
  onWalletChange,
}: MonthlyReportProps) {
  const router = useRouter();
  const [result, setResult] = useState<{
    key: string;
    data: MonthlyReportDTO | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [walletSearch, setWalletSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
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
  const searchedWallets = available.filter((wallet) =>
    wallet.name.toLocaleLowerCase("id-ID").includes(walletSearch.trim().toLocaleLowerCase("id-ID")),
  );
  /*
    Never request a scope or wallet the selector cannot represent. The parent
    resets both from the URL; until then the report keeps its loading shape
    instead of rendering a misleading empty or error result.
  */
  const waitingForScope = walletsLoading ||
    (scope === "personal" && personalUnavailable) ||
    (walletIds.length > 0 && !walletsError && selectedWallets.length !== walletIds.length);
  const requestKey = `${month}|${scope}|${walletIds.join(",")}|${reloadToken}`;
  const printKey = `${month}|${scope}|${walletIds.join(",")}`;
  const printKeyRef = useRef(printKey);
  const loading = result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;

  useEffect(() => {
    if (waitingForScope) return;
    let active = true;
    const controller = new AbortController();

    const params = new URLSearchParams({ month, scope });
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
  }, [month, requestKey, router, scope, waitingForScope, walletIds]);

  /*
    A print run belongs to one month + scope + wallet combination. Changing any
    of them discards the rows and aborts an in-flight page loop (AC-F7-17), so a
    detail page can never print for a combination that is no longer on screen.
  */
  useEffect(() => {
    printKeyRef.current = printKey;
    printAbortRef.current?.abort();
    setPreviewOpen(false);
  }, [printKey]);

  useEffect(
    () => () => {
      printAbortRef.current?.abort();
    },
    [],
  );

  const showLoading = loading || waitingForScope;
  const monthLabel = monthKeyLabel(month);
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

  const preparePreview = async () => {
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

    flushSync(() => {
      setPrintRun({ key, report: data, status: "ready", rows });
      setPreviewOpen(true);
    });
  };

  const printPreview = () => {
    if (!historicalLedger) return;

    const originalTitle = document.title;
    const restoreTitle = () => {
      document.title = originalTitle;
    };
    window.addEventListener("afterprint", restoreTitle, { once: true });
    const scopeLabel = scope === "all" ? "Semua" : scope === "shared" ? "Bersama" : "Pribadi";
    const walletLabel = (data.wallet?.name ?? (walletIds.length ? `${walletIds.length} dompet` : "Semua dompet"))
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    /* Browsers commonly use the page title as the suggested PDF filename. */
    document.title = `Ringkasan ${monthKeyLabel(month)} - ${scopeLabel} - ${walletLabel}`;
    try {
      window.print();
    } finally {
      /* Synchronous restore plus the afterprint listener cover Cancel/Escape. */
      restoreTitle();
    }
  };

  return (
    <section aria-label="Laporan bulanan" className="space-y-5">
      {previewOpen ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-card-border bg-card/95 p-3 shadow-bento backdrop-blur print:hidden">
          <p className="text-sm font-semibold text-ink">Pratinjau laporan {monthLabel}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPreviewOpen(false)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-blue hover:bg-blue-wash">
              <X className="h-4 w-4" aria-hidden="true" /> Tutup
            </button>
            <button type="button" onClick={printPreview} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-green px-4 text-sm font-semibold text-white hover:bg-brand-green-hover">
              <Printer className="h-4 w-4" aria-hidden="true" /> Cetak / simpan PDF
            </button>
          </div>
        </div>
      ) : null}
      <div className={cn("space-y-2 print:hidden", previewOpen && "hidden")}>
        <div className="flex flex-wrap items-end gap-3">
          <SegmentedControl<ReportScope>
            label="Lingkup laporan"
            value={scope}
            options={[
              { value: "all", label: "Semua" },
              {
                value: "personal",
                label: "Pribadi",
                disabled: personalUnavailable,
                disabledReason: "Kamu belum punya dompet pribadi.",
              },
              { value: "shared", label: "Bersama" },
            ]}
            onChange={(next) => {
              onScopeChange(next);
            }}
          />

          <fieldset className="w-full space-y-2 rounded-2xl border border-card-border bg-card p-3 sm:flex-1">
            <legend className="px-1 text-sm font-semibold text-ink">Pilih dompet</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-2" aria-live="polite">
                {walletsLoading ? "Memuat dompet..." : walletIds.length ? `${walletIds.length} dipilih` : `Semua dompet (${available.length})`}
              </span>
              {walletIds.length ? (
                <button
                  type="button"
                  onClick={() => onWalletChange([])}
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-blue underline underline-offset-2"
                >
                  Hapus pilihan
                </button>
              ) : null}
            </div>
            <label className="block">
              <span className="sr-only">Cari dompet laporan</span>
              <input
                type="search"
                value={walletSearch}
                onChange={(event) => setWalletSearch(event.target.value)}
                placeholder="Cari nama dompet"
                disabled={walletsLoading || Boolean(walletsError)}
                className="min-h-11 w-full rounded-xl border border-input-border bg-card px-3 text-sm text-ink placeholder:text-placeholder focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15 disabled:opacity-60"
              />
            </label>
            <div className="max-h-48 space-y-1 overflow-y-auto" role="group" aria-label="Daftar dompet laporan">
              {walletsLoading ? (
                <p className="px-2 py-3 text-sm text-ink-3">Memuat daftar dompet...</p>
              ) : walletsError ? (
                <p className="px-2 py-3 text-sm text-danger">Dompet tidak tersedia.</p>
              ) : searchedWallets.length ? searchedWallets.map((wallet) => (
                <label key={wallet.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm text-ink hover:bg-blue-wash">
                  <input
                    type="checkbox"
                    checked={walletIds.includes(wallet.id)}
                    onChange={(event) => onWalletChange(event.target.checked
                      ? [...walletIds, wallet.id]
                      : walletIds.filter((id) => id !== wallet.id))}
                    className="h-4 w-4 accent-blue"
                  />
                  <span className="min-w-0 flex-1 truncate">{wallet.name}</span>
                  <span className="shrink-0 text-xs text-ink-3">
                    {wallet.scope === "SHARING" ? "Bersama" : "Pribadi"}{wallet.archivedAt ? ", Arsip" : ""}
                  </span>
                </label>
              )) : (
                <p className="px-2 py-3 text-sm text-ink-3">
                  {available.length ? "Tidak ada dompet yang cocok." : "Belum ada dompet untuk cakupan ini."}
                </p>
              )}
            </div>
            <p className="text-xs text-ink-3">
              Transfer antar-dompet yang seluruh sisinya ada di pilihan tidak masuk ke pemasukan atau pengeluaran. Jika sisi pasangannya berada di dompet yang tidak dipilih, transfer dihitung sebagai pemasukan atau pengeluaran sesuai arah pada dompet terpilih.
            </p>
          </fieldset>

          {canPrint ? (
            <button
              type="button"
              onClick={() => void preparePreview()}
              disabled={preparing}
              aria-busy={preparing || undefined}
              className="ml-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-blue hover:bg-blue-wash disabled:cursor-not-allowed disabled:text-ink-2 disabled:hover:bg-transparent sm:w-auto sm:min-w-52"
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
              {preparing ? "Menyiapkan pratinjau..." : "Pratinjau laporan"}
            </button>
          ) : null}
        </div>
        {printFailed ? (
          <p role="status" className="text-xs text-danger">
            Detail transaksi belum bisa disiapkan.{" "}
            <button
              type="button"
              onClick={() => void preparePreview()}
              className="min-h-11 rounded-full px-2 text-sm font-semibold text-blue hover:bg-blue-wash"
            >
              Coba lagi
            </button>
          </p>
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
        <>
          <div className={cn("space-y-5 print:space-y-2 print:break-after-page", previewOpen && "rounded-3xl border border-card-border bg-card p-3 sm:p-5")}>
            <h2 className="hidden text-2xl font-bold tracking-tight text-ink print:mb-1 print:block print:text-xl">
              Laporan {monthLabel}
            </h2>
            <BalanceCard report={data} month={month} />
            <MovementTrace report={data} hasWalletSelection={walletIds.length > 0} />
            {data.transactionCount === 0 ? (
              <Card className="text-center print:hidden">
                <p className="text-[15px] font-medium text-ink">
                  {data.wallet
                    ? `Belum ada transaksi pada dompet ${data.wallet.name} untuk ${monthLabel}.`
                    : `Belum ada transaksi pada ${monthLabel}.`}
                </p>
              </Card>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2 print:grid-cols-2 print:gap-2">
                <BreakdownCard
                  title="Pemasukan"
                  type="income"
                  breakdown={data.income}
                  delta={data.delta.moneyInMinor}
                  monthLabel={monthLabel}
                  actionHref={activityHref({
                    view: "active",
                    month,
                    filter: "in",
                    scope,
                    walletIds,
                  })}
                />
                <BreakdownCard
                  title="Pengeluaran"
                  type="expense"
                  breakdown={data.expense}
                  delta={data.delta.moneyOutMinor}
                  monthLabel={monthLabel}
                  actionHref={activityHref({
                    view: "active",
                    month,
                    filter: "out",
                    scope,
                    walletIds,
                  })}
                  actionLabel="Lihat semua pengeluaran"
                />
              </div>
            )}
            <BalanceMovementChart
              key={`${month}-${scope}-${walletIds.join(",") || "all"}`}
              data={data.dailyBalances}
              monthLabel={monthLabel}
              isCurrentMonth={data.isCurrentMonth}
              scopeLabel={scope === "all" ? "semua" : scope === "shared" ? "bersama" : "pribadi"}
            />
            <GoldReportSection scope={scope} liquidBalanceMinor={data.closingMinor} />
            <ReportFootnotes report={data} scope={scope} walletLabel={walletIds.length ? selectedWallets.map((wallet) => wallet.name).join(", ") : "Semua dompet"} />
          </div>
          {historicalLedger ? (
            <PrintTransactionDetail rows={historicalLedger} monthLabel={monthLabel} preview={previewOpen} />
          ) : null}
        </>
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

function BalanceCard({ report, month }: { report: MonthlyReportDTO; month: string }) {
  const label = report.isCurrentMonth ? "Sisa bulan ini" : `Sisa akhir ${monthNameOnly(month)}`;
  return (
    <Card
      variant="navy"
      className="w-full p-6 sm:p-8 print:break-inside-avoid print:p-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-on-dark-soft print:text-[8pt]">{label}</p>
      <p className="mt-2 whitespace-nowrap text-4xl font-bold tabular-nums tracking-tight text-white sm:text-[2.5rem] print:mt-0.5 print:text-2xl">
        {formatIDR(report.closingMinor)}
      </p>
      <DeltaLine amountMinor={report.delta.closingMinor} className="mt-2 text-sm text-on-dark-soft print:mt-0.5 print:text-[8pt]" />
      <p className="mt-3 text-xs text-on-dark-muted print:mt-0.5 print:text-[8pt]">Setelah seluruh pengeluaran tercatat.</p>
    </Card>
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
}: {
  title: "Pemasukan" | "Pengeluaran";
  type: "income" | "expense";
  breakdown: ReportBreakdownDTO;
  delta: number | null;
  monthLabel: string;
  actionHref?: string;
  actionLabel?: "Lihat semua pemasukan" | "Lihat semua pengeluaran";
}) {
  const income = type === "income";
  const emptyCopy = income
    ? `Belum ada pemasukan pada ${monthLabel}.`
    : `Belum ada pengeluaran pada ${monthLabel}.`;

  return (
    <Card className="flex flex-col p-5 sm:p-6 print:break-inside-avoid print:p-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full print:h-7 print:w-7",
            income ? "bg-mint text-green" : "bg-blue-tint text-blue",
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
          income ? "text-green" : "text-ink",
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
        <CategoryDonutChart title={title} breakdown={breakdown} />
      )}

      <div className="mt-auto pt-4 print:pt-2">
        <div className="flex items-baseline justify-between gap-3 border-t border-row-divider pt-3 print:pt-1.5">
          <span className="text-sm font-semibold text-ink-2">Subtotal</span>
          <span
            className={cn(
              "whitespace-nowrap text-base font-bold tabular-nums print:text-sm",
              income ? "text-green" : "text-ink",
            )}
          >
            {formatIDR(breakdown.totalMinor)}
          </span>
        </div>
      </div>

      {actionHref ? (
        <Link
          href={actionHref}
          className="mt-2 inline-flex min-h-11 items-center self-start rounded-full px-4 text-sm font-semibold text-blue hover:bg-blue-wash print:hidden"
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

/*
  Second page of the print document (AC-F7-17). Every node is print-only:
  `hidden` keeps it out of layout, tab order, and the screen reader while the
  report is read on screen.
*/
function PrintTransactionDetail({
  rows,
  monthLabel,
  preview,
}: {
  rows: ReportLedgerRow[];
  monthLabel: string;
  preview: boolean;
}) {
  return (
    <section className={cn(preview ? "rounded-3xl border border-card-border bg-card p-3 sm:p-5" : "hidden print:block print:break-before-page")}>
      <h2 className="text-2xl font-bold text-ink">
        Rincian transaksi {monthLabel}
      </h2>
      {preview ? (
        <div className="mt-4 space-y-2 sm:hidden">
          {rows.map((row) => {
            const amount = row.amountMinor;
            return (
              <article key={row.id} className="rounded-2xl border border-row-divider bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-ink-3">{formatReportDetailDate(row.occurredAt)}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-ink">{row.description}</p>
                  </div>
                  <p className={cn("shrink-0 text-right text-sm font-semibold tabular-nums", amount === null ? "text-ink-3" : amount >= 0 ? "text-green" : "text-ink")}>
                    {amount === null ? "—" : `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatIDR(Math.abs(amount))}`}
                  </p>
                </div>
                <p className="mt-2 border-t border-row-divider pt-2 text-xs text-ink-3">
                  Sisa saldo <span className="font-semibold tabular-nums text-ink">{formatIDR(row.balanceMinor)}</span>
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
      <div className={cn("mt-4 overflow-x-auto rounded-xl border border-row-divider", preview && "hidden sm:block")}>
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-subtle">
            <tr className="border-b border-row-divider text-xs font-semibold uppercase tracking-wide text-ink-3">
              <th className="px-2 py-2">Tanggal</th>
              <th className="px-2 py-2">Transaksi</th>
              <th className="px-2 py-2 text-right">Nominal (+/−)</th>
              <th className="px-2 py-2 text-right">Sisa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => <PrintLedgerRow key={row.id} row={row} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrintLedgerRow({
  row,
}: {
  row: ReportLedgerRow;
}) {
  const amount = row.amountMinor;
  return (
    <tr className={cn("break-inside-avoid border-b border-row-divider", row.kind === "opening" || row.kind === "closing" ? "bg-surface-subtle font-semibold" : "")}>
      <td className="whitespace-nowrap px-2 py-2 text-xs text-ink-3">{formatReportDetailDate(row.occurredAt)}</td>
      <td className="px-2 py-2 text-sm text-ink">{row.description}</td>
      <td className={cn("whitespace-nowrap px-2 py-2 text-right text-sm font-medium tabular-nums", amount === null ? "text-ink-3" : amount >= 0 ? "text-green" : "text-ink")}>
        {amount === null ? "—" : `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatIDR(Math.abs(amount))}`}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums text-ink">{formatIDR(row.balanceMinor)}</td>
    </tr>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Memuat laporan bulanan">
      <Card variant="navy" className="p-6 sm:max-w-2xl sm:p-8">
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
