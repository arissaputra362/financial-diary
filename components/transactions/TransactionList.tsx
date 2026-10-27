"use client";

import { ArrowLeftRight, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  formatDateLabel,
  formatTimeLabel,
  jakartaDateKey,
  todayJakarta,
  yesterdayJakarta,
} from "@/lib/dates";
import { formatSignedIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDTO } from "@/types/api";
import { categoryEmoji, categoryLabel, categoryTone, isTransferLeg } from "./categories";

export interface TransactionListProps {
  rows: TransactionDTO[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  mode: "active" | "trash";
  nextCursor: string | null;
  deletingId: string | null;
  restoringId: string | null;
  /** Overrides the empty-state copy, for example month-aware wording. */
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenDetail: (row: TransactionDTO) => void;
  onDelete: (row: TransactionDTO) => void;
  onRestore: (row: TransactionDTO) => void;
}

interface DayGroup {
  key: string;
  label: string;
  rows: TransactionDTO[];
}

/* Active rows arrive newest-first, so groups keep that order per Jakarta day. */
function groupByDay(rows: TransactionDTO[]): DayGroup[] {
  const today = todayJakarta();
  const yesterday = yesterdayJakarta();
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const row of rows) {
    const key = jakartaDateKey(row.occurredAt);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label:
          key === today
            ? "Hari ini"
            : key === yesterday
              ? "Kemarin"
              : formatDateLabel(key),
        rows: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/* Every data view ships empty, loading, and error states (antislop §7). */
export function TransactionList({
  rows,
  loading,
  loadingMore,
  error,
  mode,
  nextCursor,
  deletingId,
  restoringId,
  emptyDescription,
  emptyAction,
  onRetry,
  onLoadMore,
  onOpenDetail,
  onDelete,
  onRestore,
}: TransactionListProps) {
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Memuat transaksi">
        {[0, 1].map((block) => (
          <Card key={block} className="space-y-3 px-4 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="danger" className="text-center">
        <p className="text-[15px] font-medium text-danger">{error}</p>
        <p className="mt-1 text-sm text-ink-2">Periksa koneksimu lalu coba lagi.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-hover"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Coba lagi
        </button>
      </Card>
    );
  }

  if (rows.length === 0) {
    return mode === "trash" ? (
      <Card className="text-center">
        <h2 className="text-lg font-semibold text-ink">Trash masih kosong</h2>
        <p className="mt-1 text-[15px] text-ink-2">
          Transaksi yang kamu hapus akan muncul di sini dan bisa dipulihkan.
        </p>
      </Card>
    ) : (
      <EmptyState
        title="Belum ada transaksi"
        description={
          emptyDescription ??
          "Catat pemasukan atau pengeluaran pertamamu supaya aktivitas keluarga terlihat di sini."
        }
        action={emptyAction}
      />
    );
  }

  if (mode === "trash") {
    return (
      <div className="space-y-4">
        <Card className="px-4 py-2">
          <ul className="divide-y divide-row-divider">
            {rows.map((row) => (
              <RowItem
                key={row.id}
                row={row}
                mode={mode}
                busy={deletingId === row.id || restoringId === row.id}
                onOpenDetail={onOpenDetail}
                onDelete={onDelete}
                onRestore={onRestore}
              />
            ))}
          </ul>
        </Card>
        {loadingMore ? <LoadingMoreRows /> : null}
        {nextCursor ? (
          <div className="flex justify-center pt-1 pb-2">
            <Button variant="secondary" onClick={onLoadMore} isLoading={loadingMore}>
              Muat lebih banyak
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupByDay(rows).map((group) => (
        <Card key={group.key} className="px-4 py-2">
          <h3 className="px-1 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-3">
            {group.label}
          </h3>
          <ul className="divide-y divide-row-divider">
            {group.rows.map((row) => (
              <RowItem
                key={row.id}
                row={row}
                mode={mode}
                busy={deletingId === row.id || restoringId === row.id}
                onOpenDetail={onOpenDetail}
                onDelete={onDelete}
                onRestore={onRestore}
              />
            ))}
          </ul>
        </Card>
      ))}
      {loadingMore ? <LoadingMoreRows /> : null}
      {nextCursor ? (
        <div className="flex justify-center pt-1 pb-2">
          <Button variant="secondary" onClick={onLoadMore} isLoading={loadingMore}>
            Muat lebih banyak
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LoadingMoreRows() {
  return (
    <div
      className="space-y-3 rounded-3xl border border-card-border bg-card px-4 py-4"
      aria-busy="true"
      aria-label="Memuat transaksi lainnya"
    >
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function RowItem({
  row,
  mode,
  busy,
  onOpenDetail,
  onDelete,
  onRestore,
}: {
  row: TransactionDTO;
  mode: "active" | "trash";
  busy: boolean;
  onOpenDetail: (row: TransactionDTO) => void;
  onDelete: (row: TransactionDTO) => void;
  onRestore: (row: TransactionDTO) => void;
}) {
  const transfer = isTransferLeg(row);
  const generic = row.wallet === null && row.source === null;
  const isIncome = row.type === "MONEY_IN";
  const title = generic
    ? isIncome
      ? "Transfer dari dompet pribadi"
      : "Transfer ke dompet pribadi"
    : row.merchant ?? row.note ?? (transfer ? "Transfer antar dompet" : categoryLabel(row.category));
  const subtitleParts: string[] = generic
    ? ["Aktivitas umum"]
    : [transfer ? "Transfer antar dompet" : categoryLabel(row.category)];
  if (!generic && row.wallet) subtitleParts.push(row.wallet.name);
  if (mode === "trash") {
    subtitleParts.push(formatDateLabel(row.occurredAt));
    if (row.deletedAt) subtitleParts.push(`Dihapus ${formatDateLabel(row.deletedAt)}`);
  } else {
    const time = formatTimeLabel(row.occurredAt);
    if (time) subtitleParts.push(time);
  }
  const subtitle = subtitleParts.join(" · ");
  const signedAmount = formatSignedIDR(isIncome ? row.amountMinor : -row.amountMinor);
  const longAmount = signedAmount.length > 13;
  const amountColor =
    transfer ? "text-ink" : isIncome ? "text-green" : "text-ink";

  return (
    <li>
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          onClick={() => onOpenDetail(row)}
          disabled={busy}
          aria-label={`Buka detail transaksi ${signedAmount} ${title}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 text-left hover:bg-blue-wash"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl",
              transfer ? "bg-blue-wash text-blue" : categoryTone(row.category),
            )}
          >
            {transfer ? <ArrowLeftRight className="h-5 w-5" /> : categoryEmoji(row.category)}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-ink">{title}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-3">{subtitle}</span>
            {longAmount ? (
              <span className={cn("mt-1 block text-sm font-bold tabular-nums sm:hidden", amountColor)}>
                {signedAmount}
              </span>
            ) : null}
          </span>

          <span
            className={cn(
              "shrink-0 whitespace-nowrap font-bold tabular-nums",
              longAmount ? "hidden text-sm sm:block" : "text-[15px]",
              amountColor,
            )}
          >
            {signedAmount}
          </span>
        </button>

        {mode === "active" ? (
          <button
            type="button"
            onClick={() => onDelete(row)}
            disabled={busy}
            aria-label={`Hapus transaksi ${signedAmount} ${title}`}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-ink-2 hover:bg-danger-bg hover:text-danger disabled:cursor-not-allowed disabled:text-ink-3"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Hapus
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRestore(row)}
            disabled={busy}
            aria-label={`Pulihkan transaksi ${signedAmount} ${title}`}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-ink-2 hover:bg-mint hover:text-green disabled:cursor-not-allowed disabled:text-ink-3"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Pulihkan
          </button>
        )}
      </div>
    </li>
  );
}
