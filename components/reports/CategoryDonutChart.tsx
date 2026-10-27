import { formatIDR } from "@/lib/format";
import type { ReportBreakdownDTO } from "@/types/api";
import { categoryLabel } from "../transactions/categories";

const SLICE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
] as const;
const RADIUS = 35;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Slice = { name: string; amountMinor: number; color: string };

function getSlices(breakdown: ReportBreakdownDTO): Slice[] {
  const slices = breakdown.categories.map((category, index) => ({
    name: categoryLabel(category.name),
    amountMinor: category.amountMinor,
    color: SLICE_COLORS[index % SLICE_COLORS.length] ?? SLICE_COLORS[0],
  }));

  if (breakdown.otherCategoryCount > 0 && breakdown.otherAmountMinor > 0) {
    slices.push({
      name: `Lainnya (${breakdown.otherCategoryCount})`,
      amountMinor: breakdown.otherAmountMinor,
      color: SLICE_COLORS[slices.length % SLICE_COLORS.length] ?? SLICE_COLORS[0],
    });
  }
  if (breakdown.uncategorizedMinor > 0) {
    slices.push({
      name: "Tanpa kategori",
      amountMinor: breakdown.uncategorizedMinor,
      color: SLICE_COLORS[slices.length % SLICE_COLORS.length] ?? SLICE_COLORS[0],
    });
  }
  return slices;
}

function shareLabel(amountMinor: number, totalMinor: number): string {
  const share = Math.round((amountMinor / totalMinor) * 100);
  return share === 0 && amountMinor > 0 ? "<1%" : `${share}%`;
}

export function CategoryDonutChart({
  title,
  breakdown,
}: {
  title: "Pemasukan" | "Pengeluaran";
  breakdown: ReportBreakdownDTO;
}) {
  const slices = getSlices(breakdown);
  const sliceTotal = slices.reduce((sum, slice) => sum + slice.amountMinor, 0);
  if (breakdown.totalMinor <= 0 || sliceTotal <= 0) return null;

  const { renderedSlices } = slices.reduce(
    (result, slice) => {
      const length = (slice.amountMinor / sliceTotal) * CIRCUMFERENCE;
      return {
        offset: result.offset + length,
        renderedSlices: [
          ...result.renderedSlices,
          { ...slice, length, offset: result.offset },
        ],
      };
    },
    {
      offset: 0,
      renderedSlices: [] as Array<Slice & { length: number; offset: number }>,
    },
  );

  return (
    <figure className="mt-4 grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 print:grid-cols-[5rem_minmax(0,1fr)] print:gap-2">
      <div className="relative aspect-square w-28 print:w-20" aria-hidden="true">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--color-blue-wash)" strokeWidth="18" />
          {renderedSlices.map((slice, index) => (
            <circle
              key={`${slice.name}-${index}`}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={slice.color}
              strokeWidth="18"
              strokeDasharray={`${slice.length} ${CIRCUMFERENCE - slice.length}`}
              strokeDashoffset={-slice.offset}
              strokeLinecap="butt"
              className="[paint-order:stroke]"
            />
          ))}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-ink-2 print:text-[6pt]">
          Komposisi
        </span>
      </div>
      <ul className="min-w-0 space-y-2 print:space-y-0.5" aria-label={`${title} berdasarkan kategori`}>
        {slices.map((slice, index) => (
          <li key={`${slice.name}-${index}`} className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white"
                style={{ backgroundColor: slice.color }}
              />
              <span className="min-w-0 truncate text-xs font-medium text-ink-2 print:text-[7pt]">
                {slice.name}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-ink-3 print:text-[6pt]">
                {shareLabel(slice.amountMinor, breakdown.totalMinor)}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-ink print:text-[7pt]">
              {formatIDR(slice.amountMinor)}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">Komposisi {title.toLowerCase()} berdasarkan kategori pada periode ini.</figcaption>
    </figure>
  );
}
