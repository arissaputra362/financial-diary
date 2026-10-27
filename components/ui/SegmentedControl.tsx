"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Disabled options stay readable but cannot be selected (AC-F7-7). */
  disabled?: boolean;
  /** Plain-language reason; the caller renders the visible explanation. */
  disabledReason?: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name for the group, for example "Mode budget". */
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Two-option scope pill (design 01 §5.3a). Selection is a real state change,
 * not decoration: `aria-selected` names the active option and Left/Right (plus
 * Home/End) move the roving Tab stop, so the control is usable without a mouse.
 * Every option keeps the 44px touch floor.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const enabled = (index: number): boolean => !options[index]?.disabled;

  const nextEnabled = (from: number, step: 1 | -1): number | null => {
    for (let offset = 1; offset <= options.length; offset += 1) {
      const index = (from + step * offset + options.length) % options.length;
      if (enabled(index)) return index;
    }
    return null;
  };

  const edgeEnabled = (fromStart: boolean): number | null => {
    const indexes = options.map((_, index) => index);
    if (!fromStart) indexes.reverse();
    return indexes.find((index) => enabled(index)) ?? null;
  };

  const selectAt = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    optionRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = nextEnabled(index, 1);
    } else if (event.key === "ArrowLeft") {
      nextIndex = nextEnabled(index, -1);
    } else if (event.key === "Home") {
      nextIndex = edgeEnabled(true);
    } else if (event.key === "End") {
      nextIndex = edgeEnabled(false);
    }
    if (nextIndex === null) return;
    event.preventDefault();
    selectAt(nextIndex);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex w-full rounded-full bg-blue-wash p-1 sm:w-auto",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={option.disabled || undefined}
            disabled={option.disabled}
            title={option.disabled ? option.disabledReason : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => selectAt(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "min-h-11 flex-1 rounded-full px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-blue-wash sm:flex-none",
              selected
                ? "bg-card font-semibold text-ink shadow-sm"
                : "font-medium text-ink-2 hover:text-ink",
              option.disabled && "cursor-not-allowed text-ink-2 hover:text-ink-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
