"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyMoneyValueEdit,
  formatMoneyInputValue,
} from "@/lib/money-input";

export interface MoneyInputProps {
  id: string;
  /** Canonical rupiah value, using a dot for an optional decimal part. */
  value: string;
  /** Receives a normalized rupiah value after every accepted edit. */
  onValueChange: (value: string) => void;
  maxDigits?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  name?: string;
  autoComplete?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/* React warns when useLayoutEffect runs during server rendering. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Rupiah amount input with live Indonesian thousands grouping (design 01 §5.8).
 * The DOM uses Indonesian grouping; `value` and `onValueChange` stay a
 * canonical decimal string. English and Indonesian
 * separators are accepted; the visible value stays Indonesian grouped (3.000,12).
 */
export function MoneyInput({
  id,
  value,
  onValueChange,
  maxDigits,
  disabled = false,
  className,
  placeholder,
  name,
  autoComplete = "off",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const display = formatMoneyInputValue(value);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const nativeEvent = event.nativeEvent;
    const isInputEvent = typeof InputEvent !== "undefined" && nativeEvent instanceof InputEvent;
    const inputType = isInputEvent ? nativeEvent.inputType : undefined;
    const data = isInputEvent ? (nativeEvent.data ?? undefined) : undefined;

    const result = applyMoneyValueEdit({
      raw,
      caret,
      previousDigits: value,
      inputType,
      data,
      maxDigits,
    });

    if (result.digits === value) {
      if (input.value !== result.display) input.value = result.display;
      input.setSelectionRange(result.caret, result.selectionEnd ?? result.caret);
      return;
    }

    pendingCaretRef.current = result.caret;
    onValueChange(result.digits);
  };

  useIsomorphicLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    const input = inputRef.current;
    if (!input || document.activeElement !== input) return;
    input.setSelectionRange(caret, caret);
  }, [value]);

  return (
    <input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      autoComplete={autoComplete}
      value={display}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className={className}
    />
  );
}
