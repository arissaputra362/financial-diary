"use client";

import { useState } from "react";
import { formatIDR } from "@/lib/format";
import { todayJakarta } from "@/lib/dates";
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

const compactIDRFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  currencyDisplay: "narrowSymbol",
  notation: "compact",
  maximumFractionDigits: 1,
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

function axisTickLabel(date: string): string {
  const value = jakartaNoon(date);
  return value ? dayFormatter.format(value) : date;
}

function shouldShowLabel(index: number, count: number, step: number): boolean {
  if (index === 0 || index === count - 1) return true;
  if (index % step !== 0) return false;
  return count - 1 - index >= 4;
}

export interface BalanceMovementChartProps {
  data: DailyBalanceDTO[];
  /** Long month label, for example "Oktober 2026". */
  monthLabel: string;
  /** True while the selected report period is the current Jakarta month. */
  isCurrentMonth: boolean;
  /** Report scope, used in the accessible name. */
  scopeLabel: "semua" | "bersama" | "pribadi";
}

/** Daily closing balances shown as a step-area chart with one date slider. */
export function BalanceMovementChart({
  data,
  monthLabel,
  isCurrentMonth,
  scopeLabel,
}: BalanceMovementChartProps) {
  const today = todayJakarta();
  const visibleData = isCurrentMonth ? data.filter((point) => point.date <= today) : data;
  const points = visibleData.length > 0
    ? visibleData
    : data.length > 0
      ? [data[0] as DailyBalanceDTO]
      : [{ date: "", closingMinor: 0 }];
  const values = points.map((point) => point.closingMinor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const isFlat = values.every((value) => value === values[0]);

  const toY = (value: number): number => {
    if (max === min) return 50;
    return 92 - ((value - min) / (max - min)) * 84;
  };
  const yTicks =
    max === min
      ? [{ value: min, y: 50 }]
      : Array.from({ length: 5 }, (_, index) => {
          const value = min + ((max - min) * index) / 4;
          return { value, y: toY(value) };
        });

  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length <= 1 ? 50 : (index / (points.length - 1)) * 100,
    y: toY(point.closingMinor),
  }));
  const firstPoint = coordinates[0] ?? { x: 0, y: 50 };
  const lastPoint = coordinates[coordinates.length - 1] ?? { x: 100, y: 50 };
  const stepSegments = coordinates.slice(1).map((point) => `H ${point.x} V ${point.y}`).join(" ");
  const linePath = `M ${firstPoint.x} ${firstPoint.y} ${stepSegments}`;
  const areaPath = `M ${firstPoint.x} 100 L ${firstPoint.x} ${firstPoint.y} ${stepSegments} L ${lastPoint.x} 100 Z`;

  const [activeIndex, setActiveIndex] = useState(coordinates.length - 1);
  const safeActiveIndex = Math.min(activeIndex, coordinates.length - 1);
  const selectedPoint = coordinates[safeActiveIndex] ?? coordinates[0];
  const selectedLabel = selectedPoint ? tooltipText(selectedPoint) : "";
  const selectedDayLabel = selectedPoint?.date
    ? selectedLabel.split(":")[0] ?? axisLabel(selectedPoint.date)
    : "Tanggal tidak tersedia";
  const rangeEndLabel = lastPoint.date ? axisLabel(lastPoint.date) : "";
  const labelStep = 7;

  return (
    <section
      aria-labelledby="balance-movement-title"
      className="min-w-0 break-inside-avoid rounded-3xl border border-card-border bg-card p-5 shadow-bento sm:p-6 print:p-3"
    >
      <h2 id="balance-movement-title" className="text-lg font-semibold text-ink print:text-sm">
        Pergerakan saldo harian
      </h2>
      <p className="mt-1 text-sm text-ink-2 print:mt-0 print:text-[7pt]">
        Saldo akhir per hari pada {monthLabel}
        {isCurrentMonth && rangeEndLabel ? ` sampai ${rangeEndLabel}` : ""}.
      </p>

      {selectedPoint ? (
        <div
          className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-blue-wash px-3.5 py-2.5"
          data-testid="balance-selection"
        >
          <span className="min-w-0 text-sm font-medium text-ink-2">{selectedDayLabel}</span>
          <span className="shrink-0 text-base font-bold tabular-nums text-ink">
            {formatIDR(selectedPoint.closingMinor)}
          </span>
        </div>
      ) : null}

      <div
        className={`mt-4 grid min-w-0 gap-2 print:mt-2 print:gap-1 ${
          isFlat
            ? "grid-cols-1"
            : "grid-cols-[3.75rem_minmax(0,1fr)] print:grid-cols-[3.5rem_minmax(0,1fr)]"
        }`}
      >
        {!isFlat ? (
          <div className="relative h-40 min-w-0 sm:h-56 print:h-20" aria-hidden="true">
            {yTicks.map((tick, index) => (
              <span
                key={`${tick.value}-${index}`}
                className="absolute right-0 whitespace-nowrap text-[10px] font-semibold leading-none tabular-nums text-ink-2 print:text-[6pt]"
                style={{ top: `${tick.y}%`, transform: "translateY(-50%)" }}
              >
                {compactIDRFormatter.format(tick.value)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="relative min-w-0">
          <div
            role="img"
            aria-label={`Grafik area bertangga saldo ${scopeLabel}, ${monthLabel}. Skala ${formatIDR(min)} sampai ${formatIDR(max)}.`}
            className="relative h-40 min-w-0 overflow-hidden rounded-2xl bg-blue-wash sm:h-56 print:h-20"
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
            >
              {!isFlat ? <path d={areaPath} fill="var(--color-blue-tint)" fillOpacity="0.55" /> : null}
              {yTicks.map((tick, index) => (
                <line
                  key={`grid-${index}`}
                  x1="0"
                  x2="100"
                  y1={tick.y}
                  y2={tick.y}
                  stroke="var(--color-input-border)"
                  strokeWidth="0.6"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <line
                x1={selectedPoint?.x ?? 0}
                x2={selectedPoint?.x ?? 0}
                y1="0"
                y2="100"
                stroke="var(--color-brand-blue)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={linePath}
                fill="none"
                stroke="var(--color-brand-blue)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {selectedPoint ? (
                <circle
                  cx={selectedPoint.x}
                  cy={selectedPoint.y}
                  r="2.4"
                  fill="var(--color-brand-blue)"
                  stroke="white"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
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
                  className="absolute top-0 whitespace-nowrap text-[10px] font-semibold leading-3 text-ink-2"
                  style={{
                    left: first ? 0 : last ? undefined : `${point.x}%`,
                    right: last ? 0 : undefined,
                    transform: first || last ? undefined : "translateX(-50%)",
                  }}
                >
                  {axisTickLabel(point.date)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {coordinates.length > 1 ? (
        <div className="mt-1 print:hidden">
          <label htmlFor="balance-date-slider" className="sr-only">Pilih tanggal saldo</label>
          <input
            id="balance-date-slider"
            type="range"
            min={0}
            max={coordinates.length - 1}
            step={1}
            value={safeActiveIndex}
            aria-valuetext={selectedLabel}
            aria-describedby="balance-date-help"
            onChange={(event) => setActiveIndex(Number(event.target.value))}
            className="h-11 w-full cursor-pointer accent-blue"
          />
          <p id="balance-date-help" className="sr-only">
            Geser untuk memilih tanggal dan membaca saldo akhir hari tersebut.
          </p>
        </div>
      ) : null}

      {isFlat && selectedPoint ? (
        <p className="mt-1 text-xs text-ink-3" data-testid="balance-flat-note">
          {points[0]?.date && lastPoint.date
            ? `Saldo tidak berubah dari ${axisLabel(points[0].date)} sampai ${axisLabel(lastPoint.date)}.`
            : `Saldo tidak berubah pada periode ini: ${formatIDR(selectedPoint.closingMinor)}.`}
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite" data-testid="balance-live">
        {selectedLabel}
      </p>
    </section>
  );
}
