"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
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

  const selectAt = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    optionRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % options.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
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
        "inline-flex w-full rounded-full bg-[#EFF4FA] p-1 sm:w-auto",
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
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "min-h-11 flex-1 rounded-full px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4F87] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EFF4FA] sm:flex-none",
              selected
                ? "bg-white font-semibold text-[#17304F] shadow-sm"
                : "font-medium text-[#46597A] hover:text-[#17304F]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
