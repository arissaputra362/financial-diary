"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { applyMoneyInputEdit, groupDigits } from "@/lib/money-input";

export interface MoneyInputProps {
  id: string;
  /** Digit string only (no separators). This is the value the form stores. */
  value: string;
  /** Receives the normalized digit string after every accepted edit. */
  onValueChange: (digits: string) => void;
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
 * The DOM shows dots; `value` and `onValueChange` stay a plain digit string, so
 * callers keep sending the exact integer rupiah. Non-digit keystrokes are
 * dropped without disturbing a selected range, and the caret follows the
 * edited digit instead of jumping to the end.
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
  const display = groupDigits(value);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const nativeEvent = event.nativeEvent;
    const isInputEvent = typeof InputEvent !== "undefined" && nativeEvent instanceof InputEvent;
    const inputType = isInputEvent ? nativeEvent.inputType : undefined;
    const data = isInputEvent ? (nativeEvent.data ?? undefined) : undefined;

    const result = applyMoneyInputEdit({
      raw,
      caret,
      previousDigits: value,
      inputType,
      data,
      maxDigits,
    });

    if (result.digits === value) {
      /*
        The edit added nothing (letter, symbol, extra digit past the cap) or
        only touched a separator that had no digit to remove. Restore the
        rendered text and caret without a state update.
      */
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
      inputMode="numeric"
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
