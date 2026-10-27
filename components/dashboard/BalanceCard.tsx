import Link from "next/link";
import { Wallet } from "lucide-react";
import { formatIDR } from "@/lib/format";

export interface BalanceCardProps {
  balanceMinor: number;
  hasTransactions: boolean;
}

/**
 * Hero balance (AC-F2-1). The number is rendered exactly as the server computed
 * it; the client never derives it from the activity list. When the household has
 * no transactions yet, the card points at the first action.
 */
export function BalanceCard({ balanceMinor, hasTransactions }: BalanceCardProps) {
  return (
    <section
      aria-labelledby="balance-title"
      className="rounded-3xl border border-blue-border bg-blue-tint p-7 shadow-bento"
    >
      <h2
        id="balance-title"
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-2"
      >
        <Wallet className="h-4 w-4" aria-hidden="true" />
        Uang tersedia keluarga
      </h2>
      <p className="mt-4 text-4xl font-extrabold tracking-tight tabular-nums text-ink sm:text-5xl">
        {formatIDR(balanceMinor)}
      </p>
      {hasTransactions ? (
        <p className="mt-3 text-sm text-ink-2">
          Seluruh pemasukan aktif dikurangi seluruh pengeluaran aktif.
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-2">
          Belum ada transaksi.{" "}
          <Link
            href="/transactions?add=1"
            className="font-semibold text-blue underline underline-offset-2"
          >
            Tambah transaksi
          </Link>{" "}
          untuk mulai mencatat.
        </p>
      )}
    </section>
  );
}
