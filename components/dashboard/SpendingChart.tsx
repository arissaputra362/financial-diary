"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { formatDateLabel } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { DashboardPeriodKey, DashboardSpendingDTO } from "@/types/api";
import { bucketsForPeriod, type SpendingBucket } from "./spendingBuckets";

const PERIODS: DashboardPeriodKey[] = ["7D", "30D", "90D"];

type ChartScope = "PERSONAL" | "SHARED";

const SCOPE_OPTIONS: ReadonlyArray<{ value: ChartScope; label: string }> = [
  { value: "PERSONAL", label: "Pribadi" },
  { value: "SHARED", label: "Bersama" },
];

const weekdayFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "Asia/Jakarta",
});

const shortDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const dayNumberFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  timeZone: "Asia/Jakarta",
});

const dayMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function jakartaNoon(date: string): Date | null {
  const value = new Date(`${date}T12:00:00+07:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

/** One axis label: weekday for a 7-day chart, short date otherwise. */
function axisLabel(bucket: SpendingBucket, index: number, count: number): string {
  if (bucket.kind === "weekly") {
    /*
      The last bucket often ends mid-week, so its end date is the more useful
      edge label; every other label shows the bucket's real covered start.
    */
    const value = index === count - 1 ? bucket.endDate : bucket.startDate;
    const date = jakartaNoon(value);
    return date ? shortDateFormatter.format(date) : value;
  }
  const date = jakartaNoon(bucket.startDate);
  if (!date) return bucket.startDate;
  return count <= 7 ? weekdayFormatter.format(date) : shortDateFormatter.format(date);
}

/**
 * Exact range used by the tooltip and the bar's accessible name. Partial
 * weeks keep their real shorter range.
 */
function bucketRangeLabel(bucket: SpendingBucket): string {
  if (bucket.startDate === bucket.endDate) return formatDateLabel(bucket.startDate);
  const start = jakartaNoon(bucket.startDate);
  const end = jakartaNoon(bucket.endDate);
  if (!start || !end) return `${bucket.startDate} sampai ${bucket.endDate}`;

  const sameMonth = bucket.startDate.slice(0, 7) === bucket.endDate.slice(0, 7);
  const sameYear = bucket.startDate.slice(0, 4) === bucket.endDate.slice(0, 4);
  if (sameMonth) {
    return `${dayNumberFormatter.format(start)} sampai ${dateFormatter.format(end)}`;
  }
  if (sameYear) {
    return `${dayMonthFormatter.format(start)} sampai ${dateFormatter.format(end)}`;
  }
  return `${dateFormatter.format(start)} sampai ${dateFormatter.format(end)}`;
}

function bucketText(bucket: SpendingBucket): string {
  return `${bucketRangeLabel(bucket)}: ${formatIDR(bucket.amountMinor)}`;
}

/** Keep axis labels readable without clipping; edge labels are anchored. */
function shouldShowLabel(index: number, count: number, step: number): boolean {
  if (index === 0 || index === count - 1) return true;
  if (step <= 1) return true;
  if (index % step !== 0) return false;
  /* Drop a step label that would collide with the right-anchored last label. */
  return count - 1 - index >= 2;
}

export interface SpendingChartProps {
  /** Household spending over SHARING wallets, unchanged meaning. */
  spending: DashboardSpendingDTO;
  /** The caller's own spending over PERSONAL wallets (T-015). */
  personalSpending: DashboardSpendingDTO;
  period: DashboardPeriodKey;
  onPeriodChange: (period: DashboardPeriodKey) => void;
  loading?: boolean;
}

/**
 * Spending chart with 7D/30D/90D tabs and an independent `Pribadi / Bersama`
 * scope pill (AC-F2-5, AC-F2-5b; design 02 §5 card 8). `7D`/`30D` render the
 * selected scope's daily buckets untouched; `90D` groups the same daily values
 * into Monday-start weekly buckets on the client (display grouping only). Bars
 * are solid brand blue, never a gradient.
 *
 * The two scope controls on the dashboard are intentionally separate: this
 * component owns its own selection and never reads the budget card's mode.
 *
 * The bar group is a single Tab stop with roving focus: Left/Right (and
 * Home/End) move between bars, the focused bar gets a ring, and the exact pill
 * text is mirrored to an `aria-live="polite"` region. Escape hides the pill
 * without moving focus out of the chart.
 */
export function SpendingChart({
  spending,
  personalSpending,
  period,
  onPeriodChange,
  loading = false,
}: SpendingChartProps) {
  const [scope, setScope] = useState<ChartScope>("SHARED");
  const activeSpending = scope === "PERSONAL" ? personalSpending : spending;
  const isPersonal = scope === "PERSONAL";

  const buckets = useMemo(
    () => bucketsForPeriod(activeSpending.byDay, period),
    [activeSpending.byDay, period],
  );
  const max = Math.max(1, ...buckets.map((bucket) => bucket.amountMinor));
  const weekly = buckets[0]?.kind === "weekly";
  const labelStep = weekly ? 2 : buckets.length <= 7 ? 1 : 5;
  const chartLabel = weekly ? "mingguan" : "harian";

  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pillWidth, setPillWidth] = useState(0);

  const barRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pillRef = useRef<HTMLDivElement | null>(null);

  const changePeriod = (next: DashboardPeriodKey) => {
    if (next === period) return;
    setActiveIndex(0);
    setHoveredIndex(null);
    setFocusedIndex(null);
    setDismissed(false);
    onPeriodChange(next);
  };

  const changeScope = (next: ChartScope) => {
    if (next === scope) return;
    setActiveIndex(0);
    setHoveredIndex(null);
    setFocusedIndex(null);
    setDismissed(false);
    setScope(next);
  };

  const safeActiveIndex =
    buckets.length === 0 ? 0 : Math.min(activeIndex, buckets.length - 1);
  const shownIndex = hoveredIndex ?? (focusedIndex !== null && !dismissed ? safeActiveIndex : null);
  const shownBucket = shownIndex === null ? null : (buckets[shownIndex] ?? null);
  const pillText = shownBucket ? bucketText(shownBucket) : "";

  useEffect(() => {
    const node = pillRef.current;
    if (!node) {
      setPillWidth(0);
      return;
    }
    const measure = () => setPillWidth(node.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [pillText]);

  const pillCenterPercent =
    shownIndex === null || buckets.length === 0
      ? 50
      : ((shownIndex + 0.5) / buckets.length) * 100;
  const halfPill = pillWidth / 2;
  const pillStyle: CSSProperties =
    pillWidth > 0
      ? {
          left: `clamp(${halfPill}px, ${pillCenterPercent}%, calc(100% - ${halfPill}px))`,
          transform: "translateX(-50%)",
        }
      : { left: `${pillCenterPercent}%`, transform: "translateX(-50%)" };

  const focusBar = (index: number) => {
    setActiveIndex(index);
    setDismissed(false);
    barRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (buckets.length === 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setHoveredIndex(null);
      setDismissed(true);
      return;
    }
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = Math.min(buckets.length - 1, safeActiveIndex + 1);
    } else if (event.key === "ArrowLeft") {
      nextIndex = Math.max(0, safeActiveIndex - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buckets.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    focusBar(nextIndex);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setFocusedIndex(null);
    setDismissed(false);
  };

  /* Percentage heights are a display transform; the tooltip carries the exact value. */
  const barHeight = (amountMinor: number): string =>
    amountMinor <= 0 ? "2px" : `${Math.max(4, (amountMinor / max) * 100)}%`;

  return (
    <section
      data-testid="spending-chart"
      aria-labelledby="spending-title"
      className={cn(
        "min-w-0 rounded-3xl border border-[#D8E2EE] bg-white p-6 shadow-bento",
        loading && "opacity-60",
      )}
      aria-busy={loading || undefined}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="spending-title" className="text-lg font-semibold text-[#17304F]">
            Rincian pengeluaran
          </h2>
          <p className="mt-1 text-sm text-[#46597A]">
            {formatIDR(activeSpending.totalOutMinor)}
            {isPersonal
              ? " keluar dari dompet pribadimu pada periode ini."
              : " keluar pada periode ini."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end lg:flex-row lg:items-center">
          <SegmentedControl
            label="Lingkup grafik"
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={changeScope}
          />
          <div
            className="inline-flex shrink-0 self-start rounded-full bg-[#EFF4FA] p-1 sm:self-end lg:self-auto"
            role="tablist"
            aria-label="Periode grafik"
          >
            {PERIODS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={period === item}
                onClick={() => changePeriod(item)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4F87] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EFF4FA]",
                  period === item
                    ? "bg-white text-[#17304F] shadow-sm"
                    : "text-[#46597A] hover:text-[#17304F]",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-8 min-w-0">
        {shownBucket ? (
          <div
            ref={pillRef}
            aria-hidden="true"
            data-testid="spending-tooltip"
            className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] z-10 max-w-full rounded-full bg-[#14273F] px-3 py-1.5 text-xs font-semibold leading-tight text-white shadow-pill"
            style={pillStyle}
          >
            {pillText}
          </div>
        ) : null}

        <div className="rounded-2xl bg-[#EFF4FA] px-3 pb-2 pt-4 sm:px-4">
          <div
            role="group"
            aria-label={`Grafik pengeluaran ${isPersonal ? "pribadi" : "bersama"} ${chartLabel}, total ${formatIDR(
              activeSpending.totalOutMinor,
            )}. Gunakan tombol panah kiri dan kanan untuk melihat nilai tiap batang.`}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className={cn(
              "grid h-36 items-end",
              weekly || buckets.length > 7 ? "gap-1 sm:gap-2" : "gap-2",
            )}
            style={
              buckets.length > 0
                ? { gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }
                : undefined
            }
          >
            {buckets.map((bucket, index) => {
              const text = bucketText(bucket);
              return (
                <button
                  key={bucket.weekStart}
                  ref={(node) => {
                    barRefs.current[index] = node;
                  }}
                  type="button"
                  tabIndex={index === safeActiveIndex ? 0 : -1}
                  aria-label={text}
                  data-testid="spending-bar"
                  data-kind={bucket.kind}
                  onClick={() => {
                    setActiveIndex(index);
                    setFocusedIndex(index);
                    setDismissed(false);
                  }}
                  onFocus={() => {
                    setActiveIndex(index);
                    setFocusedIndex(index);
                    setDismissed(false);
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="group flex h-full min-w-0 items-end justify-center rounded-t-lg focus-visible:shadow-none focus-visible:outline-none"
                >
                  <span
                    className="block w-full max-w-10 rounded-t-lg bg-[#1D4F87] group-focus-visible:ring-2 group-focus-visible:ring-[#1D4F87] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#EFF4FA]"
                    style={{ height: barHeight(bucket.amountMinor) }}
                    data-testid="spending-bar-fill"
                  />
                </button>
              );
            })}
          </div>

          <div className="relative mt-1.5 h-3" aria-hidden="true">
            {buckets.map((bucket, index) => {
              if (!shouldShowLabel(index, buckets.length, labelStep)) return null;
              const first = index === 0;
              const last = index === buckets.length - 1;
              return (
                <span
                  key={`${bucket.weekStart}-label`}
                  data-testid="spending-axis-label"
                  className="absolute top-0 whitespace-nowrap text-[10px] font-semibold leading-3 text-[#46597A]"
                  style={{
                    left: first ? 0 : last ? undefined : `${((index + 0.5) / buckets.length) * 100}%`,
                    right: last ? 0 : undefined,
                    transform: first || last ? undefined : "translateX(-50%)",
                  }}
                >
                  {axisLabel(bucket, index, buckets.length)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" data-testid="spending-live">
        {pillText}
      </p>

      {activeSpending.totalOutMinor === 0 ? (
        <p className="mt-3 text-sm text-[#46597A]">
          {isPersonal
            ? "Belum ada pengeluaran dari dompet pribadimu pada periode ini."
            : "Belum ada pengeluaran pada periode ini."}
        </p>
      ) : null}
    </section>
  );
}
