import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDateLabel } from "@/lib/dates";
import { formatIDR, formatSignedIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDTO } from "@/types/api";
import { CategoryIcon, categoryLabel, isTransferLeg } from "@/components/transactions/categories";

export interface RecentActivityCardProps {
  initialRows: TransactionDTO[];
}

/** Five-row preview used by Beranda and Wallet. Full filtering lives on Activity. */
export function RecentActivityCard({ initialRows }: RecentActivityCardProps) {
  const visibleRows = initialRows.slice(0, 5);

  return (
    <section
      aria-labelledby="activity-title"
      className="flex h-full flex-col rounded-feature border border-card-border bg-card p-4 shadow-bento sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="activity-title" className="text-base font-semibold text-ink">
          Terakhir transaksi
        </h2>
        <Link
          href="/transactions"
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-xl px-1 text-xs font-semibold text-green hover:text-green-hover"
        >
          Lihat semua
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4">
        {visibleRows.length === 0 ? (
          <div className="rounded-2xl bg-surface-subtle p-6 text-center">
            <p className="text-[15px] font-semibold text-ink">Belum ada aktivitas</p>
            <p className="mt-1 text-sm text-ink-2">
              Transaksi yang kamu catat akan muncul di sini.
            </p>
            <Link
              href="/transactions?add=1"
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand-green px-4 text-sm font-semibold text-white hover:bg-brand-green-hover"
            >
              Tambah transaksi
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-row-divider">
            {visibleRows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <CategoryIcon category={row.category} transfer={isTransferLeg(row)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{rowTitle(row)}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-3">
                    {row.source === "OCR" ? "Hasil scan" : "Manual"} · {formatDateLabel(row.occurredAt)}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 whitespace-nowrap text-sm font-bold tabular-nums",
                    isTransferLeg(row)
                      ? "text-ink"
                      : row.type === "MONEY_IN"
                        ? "text-green"
                        : "text-ink",
                  )}
                >
                  {isTransferLeg(row)
                    ? formatIDR(row.amountMinor)
                    : formatSignedIDR(row.type === "MONEY_IN" ? row.amountMinor : -row.amountMinor)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function rowTitle(row: TransactionDTO): string {
  if (isTransferLeg(row)) return "Transfer antar dompet";
  return row.merchant ?? row.note ?? categoryLabel(row.category);
}
