import { formatIDR } from "@/lib/format";

export interface ExpenseHeroCardProps {
  /** `monthlyBudget.spentMinor`, rendered exactly as the server computed it. */
  spentMinor: number;
  /** Today's bucket from the existing `spending.byDay` data. */
  todayMinor: number;
  /** `monthlyBudget.remainingMinor`; null when no budget is set. */
  remainingMinor: number | null;
}

/**
 * R-9 expense hero (design 02 §5 card 1). Presentational only: it receives the
 * existing dashboard numbers, never fetches or recalculates money. There is no
 * period control, wallet balance, quick-action pill, or previous-month delta.
 */
export function ExpenseHeroCard({
  spentMinor,
  todayMinor,
  remainingMinor,
}: ExpenseHeroCardProps) {
  const hasSpending = spentMinor > 0;
  const longMetrics =
    formatIDR(todayMinor).length > 13 ||
    (remainingMinor !== null && formatIDR(remainingMinor).length > 13);
  const longHero = formatIDR(spentMinor).length > 16;

  return (
    <section
      aria-labelledby="expense-hero-title"
      className="rounded-3xl border border-blue-border bg-blue-tint p-6 shadow-bento"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2
            id="expense-hero-title"
            className="text-base font-semibold text-ink"
          >
            Pengeluaran bulan ini
          </h2>
          <p className="mt-1 text-xs text-ink-3">Dihitung dari transaksi di dompet bersama.</p>
          {hasSpending ? (
            <p
              className={
                longHero
                  ? "mt-2 whitespace-nowrap text-[clamp(1.25rem,5.5vw,2.5rem)] font-bold leading-[1.1] tracking-tight tabular-nums text-ink"
                  : "mt-2 whitespace-nowrap text-[clamp(1.9rem,7.2vw,2.5rem)] font-bold leading-[1.1] tracking-tight tabular-nums text-ink"
              }
            >
              {formatIDR(spentMinor)}
            </p>
          ) : (
            <>
              <p className="mt-2 text-xl font-bold text-ink">
                Belum ada pengeluaran bulan ini
              </p>
              <p className="mt-1 text-sm text-ink-2">
                Catat pengeluaran pertamamu lewat tombol Tambah transaksi.
              </p>
            </>
          )}
        </div>

        <div
          className={
            longMetrics
              ? "grid grid-cols-1 gap-3 lg:w-[22rem] lg:shrink-0"
              : "grid grid-cols-2 gap-3 lg:w-[22rem] lg:shrink-0"
          }
        >
          <div className="min-w-0 rounded-2xl bg-card/85 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
              Hari ini
            </p>
            <p className="mt-1 whitespace-nowrap text-[clamp(1rem,4.6vw,1.125rem)] font-semibold tabular-nums text-ink">
              {formatIDR(todayMinor)}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-card/85 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
              Sisa anggaran
            </p>
            <p className="mt-1 whitespace-nowrap text-[clamp(1rem,4.6vw,1.125rem)] font-semibold tabular-nums text-ink">
              {remainingMinor === null ? "Belum diatur" : formatIDR(remainingMinor)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
