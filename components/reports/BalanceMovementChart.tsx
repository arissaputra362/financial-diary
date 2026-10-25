"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DailyBalanceDTO } from "@/types/api";

const weekdayFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "Asia/Jakarta",
});

const dayFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  timeZone: "Asia/Jakarta",
});

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  timeZone: "Asia/Jakarta",
});

const dayMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

function jakartaNoon(date: string): Date | null {
  if (!date) return null;
  const value = new Date(`${date}T12:00:00+07:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function tooltipText(point: DailyBalanceDTO): string {
  const date = jakartaNoon(point.date);
  if (!date) return formatIDR(point.closingMinor);
  return `${weekdayFormatter.format(date)}, ${dayFormatter.format(date)} ${monthFormatter.format(date)}: ${formatIDR(point.closingMinor)}`;
}

function axisLabel(date: string): string {
  const value = jakartaNoon(date);
  return value ? dayMonthFormatter.format(value) : date;
}

function shouldShowLabel(index: number, count: number, step: number): boolean {
  if (index === 0 || index === count - 1) return true;
  if (index % step !== 0) return false;
  return count - 1 - index >= 2;
}

export interface BalanceMovementChartProps {
  data: DailyBalanceDTO[];
  /** Long month label, for example "Oktober 2026". */
  monthLabel: string;
  /** "bersama" or "pribadi", used in the accessible name. */
  scopeLabel: "bersama" | "pribadi";
}

/**
 * Daily closing-balance line/area chart (AC-F7-11). One point per calendar day,
 * including flat days. The point group is one Tab stop with roving focus; the
 * exact value travels in the pill, the aria-label, and the aria-live region.
 * No fixed width, no horizontal scroll, identical point count at every
 * breakpoint.
 */
export function BalanceMovementChart({
  data,
  monthLabel,
  scopeLabel,
}: BalanceMovementChartProps) {
  const points = data.length > 0 ? data : [{ date: "", closingMinor: 0 }];
  const values = points.map((point) => point.closingMinor);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const toY = (value: number): number => {
    if (max === min) return 50;
    return 92 - ((value - min) / (max - min)) * 84;
  };

  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length <= 1 ? 50 : (index / (points.length - 1)) * 100,
    y: toY(point.closingMinor),
  }));

  const linePath = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath =
    coordinates.length > 0
      ? `M ${coordinates[0]?.x ?? 0},100 L ${linePath.replaceAll(" ", " L ")} L ${coordinates[coordinates.length - 1]?.x ?? 100},100 Z`
      : "";

  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pillWidth, setPillWidth] = useState(0);

  const pointRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pillRef = useRef<HTMLDivElement | null>(null);

  const safeActiveIndex =
    coordinates.length === 0 ? 0 : Math.min(activeIndex, coordinates.length - 1);
  const shownIndex = hoveredIndex ?? (focusedIndex !== null && !dismissed ? safeActiveIndex : null);
  const shownPoint = shownIndex === null ? null : (coordinates[shownIndex] ?? null);
  const pillText = shownPoint ? tooltipText(shownPoint) : "";

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

  const pillPercent =
    shownIndex === null || coordinates.length === 0
      ? 50
      : coordinates.length === 1
        ? 50
        : (shownIndex / (coordinates.length - 1)) * 100;
  const halfPill = pillWidth / 2;
  const pillStyle: CSSProperties =
    pillWidth > 0
      ? {
          left: `clamp(${halfPill}px, ${pillPercent}%, calc(100% - ${halfPill}px))`,
          transform: "translateX(-50%)",
        }
      : { left: `${pillPercent}%`, transform: "translateX(-50%)" };

  const focusPoint = (index: number) => {
    setActiveIndex(index);
    setDismissed(false);
    pointRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (coordinates.length === 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setHoveredIndex(null);
      setDismissed(true);
      return;
    }
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = Math.min(coordinates.length - 1, safeActiveIndex + 1);
    } else if (event.key === "ArrowLeft") {
      nextIndex = Math.max(0, safeActiveIndex - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = coordinates.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    focusPoint(nextIndex);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setFocusedIndex(null);
    setDismissed(false);
  };

  const zeroY = min < 0 && max > 0 ? toY(0) : null;
  const labelStep = 7;

  return (
    <section
      aria-labelledby="balance-movement-title"
      className="min-w-0 break-inside-avoid rounded-3xl border border-[#D8E2EE] bg-white p-5 shadow-bento sm:p-6 print:p-3"
    >
      <h2 id="balance-movement-title" className="text-lg font-semibold text-[#17304F] print:text-sm">
        Pergerakan saldo harian
      </h2>
      <p className="mt-1 text-sm text-[#46597A] print:mt-0 print:text-[7pt]">
        Saldo akhir tiap hari pada {monthLabel}. Tap atau gunakan panah untuk melihat nilai tiap
        tanggal.
      </p>

      <div className="relative mt-8 min-w-0 print:mt-2">
        {shownPoint ? (
          <div
            ref={pillRef}
            aria-hidden="true"
            data-testid="balance-tooltip"
            className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] z-10 max-w-full rounded-full bg-[#14273F] px-3 py-1.5 text-xs font-semibold leading-tight text-white shadow-pill"
            style={pillStyle}
          >
            {pillText}
          </div>
        ) : null}

        <div
          role="group"
          aria-label={`Grafik saldo harian ${scopeLabel}, ${monthLabel}. Gunakan panah kiri kanan untuk membaca saldo tiap tanggal.`}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="relative h-40 min-w-0 overflow-hidden rounded-2xl bg-[#EFF4FA] sm:h-56 print:h-20"
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          >
            <path d={areaPath} fill="#DCEBFA" />
            {zeroY !== null ? (
              <line
                x1="0"
                x2="100"
                y1={zeroY}
                y2={zeroY}
                stroke="#E5EDF5"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <polyline
              points={linePath}
              fill="none"
              stroke="#1D4F87"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {coordinates.map((point, index) => {
            const active = index === safeActiveIndex;
            const focused = focusedIndex === index && !dismissed;
            return (
              <button
                key={`${point.date}-${index}`}
                ref={(node) => {
                  pointRefs.current[index] = node;
                }}
                type="button"
                tabIndex={index === safeActiveIndex ? 0 : -1}
                aria-label={tooltipText(point)}
                data-testid="balance-point"
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
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none print:h-3 print:w-3"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              >
                <span
                  className={cn(
                    "block rounded-full bg-[#1D4F87] ring-2 ring-white transition-transform",
                    active ? "h-2.5 w-2.5" : "h-1.5 w-1.5 opacity-70",
                    focused && "h-3.5 w-3.5 ring-2 ring-[#1D4F87] ring-offset-2 ring-offset-[#EFF4FA]",
                  )}
                />
              </button>
            );
          })}
        </div>

        <div className="relative mt-1.5 h-3" aria-hidden="true">
          {coordinates.map((point, index) => {
            if (!shouldShowLabel(index, coordinates.length, labelStep)) return null;
            const first = index === 0;
            const last = index === coordinates.length - 1;
            return (
              <span
                key={`${point.date}-label-${index}`}
                data-testid="balance-axis-label"
                className="absolute top-0 whitespace-nowrap text-[10px] font-semibold leading-3 text-[#46597A]"
                style={{
                  left: first ? 0 : last ? undefined : `${point.x}%`,
                  right: last ? 0 : undefined,
                  transform: first || last ? undefined : "translateX(-50%)",
                }}
              >
                {axisLabel(point.date)}
              </span>
            );
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite" data-testid="balance-live">
        {pillText}
      </p>
    </section>
  );
}
