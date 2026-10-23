/**
 * Pure helpers for Indonesian rupiah amount inputs (T-013, design 01 §5.8).
 *
 * The semantic value is always a digit string; the dots are display-only. IDR
 * scale is 0 (AGENTS.md §5), so a value never contains a decimal part.
 */

/**
 * Rupiah is stored as an int32, and the ceiling 2.147.483.647 has 10 digits, so
 * inputs cap at that digit count. The API still rejects any value above the
 * ceiling; this cap only stops the field from building one.
 */
export const MAX_IDR_DIGITS = 10;

/**
 * Keep the integer digits of a raw amount and drop any decimal part.
 *
 * Indonesian text uses dots for thousands and a comma for decimals. A comma
 * followed by exactly three digits is also accepted as an English thousands
 * separator, so "100,000" remains "100000". When both separators are present,
 * the last one is treated as the decimal separator: "12.500.000,00" becomes
 * "12500000".
 */
export function extractDigits(raw: string): string {
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");

  let integerPart = raw;
  if (lastComma > lastDot) {
    const commaSuffix = raw.slice(lastComma + 1);
    const commaIsThousandsSeparator = /^\d{3}$/.test(commaSuffix);
    if (!commaIsThousandsSeparator) {
      integerPart = raw.slice(0, lastComma);
    }
  } else if (lastDot >= 0 && lastComma >= 0) {
    /* Both separators present and the dot comes last, so the dot is decimal. */
    integerPart = raw.slice(0, lastDot);
  }

  return integerPart.replace(/\D/g, "");
}

/**
 * Normalize a raw string into the value the form stores: digits only, leading
 * zeros dropped (a lone "0" is kept), capped at `maxDigits`.
 * "000123" -> "123", "12.500,00" -> "12500", "" -> "".
 */
export function normalizeDigits(raw: string, maxDigits: number = MAX_IDR_DIGITS): string {
  const digits = extractDigits(raw).replace(/^0+(?=\d)/, "");
  return digits.slice(0, Math.max(0, maxDigits));
}

/** Group a digit string with Indonesian thousands separators: "22000000" -> "22.000.000". */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Count the digits in `text` before `offset`. Non-digit characters do not count. */
export function countDigitsBefore(text: string, offset: number): number {
  const limit = Math.min(Math.max(offset, 0), text.length);
  let count = 0;
  for (let index = 0; index < limit; index += 1) {
    if (text[index] >= "0" && text[index] <= "9") count += 1;
  }
  return count;
}

/**
 * Caret offset in the grouped display after `digitCount` digits.
 * "22.000.000" with 3 digits -> 4 (just after the third digit).
 */
export function offsetAfterDigits(display: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let count = 0;
  for (let index = 0; index < display.length; index += 1) {
    if (display[index] >= "0" && display[index] <= "9") {
      count += 1;
      if (count === digitCount) return index + 1;
    }
  }
  return display.length;
}

export interface MoneyInputEditInput {
  /** The input element's value after the browser applied the edit. */
  raw: string;
  /** The caret position in `raw` after the edit. */
  caret: number;
  /** The digit string the controlled input held before the edit. */
  previousDigits: string;
  /** `InputEvent.inputType`, when the browser provides it. */
  inputType?: string;
  /** `InputEvent.data` for text insertions, when the browser provides it. */
  data?: string;
  maxDigits?: number;
}

export interface MoneyInputEditResult {
  /** Digit string to store in form state. */
  digits: string;
  /** Grouped string to render in the input. */
  display: string;
  /** Caret position to restore in the grouped display. */
  caret: number;
  /** End of a restored selection; defaults to `caret` when omitted. */
  selectionEnd?: number;
}

/**
 * Map one native edit to the next controlled value and caret.
 *
 * Caret rule: digits before the caret stay before the caret, and each group
 * separator they cross shifts the offset by one. Deleting only a separator
 * (Backspace/Delete at a dot) removes the adjacent digit instead, so the
 * field can never stall on a separator or show broken groups.
 */
export function applyMoneyInputEdit({
  raw,
  caret,
  previousDigits,
  inputType,
  data,
  maxDigits = MAX_IDR_DIGITS,
}: MoneyInputEditInput): MoneyInputEditResult {
  const previousDisplay = groupDigits(previousDigits);

  if (inputType === "insertText" && data !== undefined && /[^\d.,]/.test(data)) {
    const start = Math.min(Math.max(caret - data.length, 0), previousDisplay.length);
    const replacedLength = previousDisplay.length - raw.length + data.length;
    const end = Math.min(Math.max(start + replacedLength, start), previousDisplay.length);
    return { digits: previousDigits, display: previousDisplay, caret: start, selectionEnd: end };
  }

  const rawDigits = extractDigits(raw);
  const digitsBeforeCaret = countDigitsBefore(raw, caret);

  let digits = normalizeDigits(raw, maxDigits);

  /*
    The edit only removed a separator: apply it to the neighbouring digit so
    Backspace/Delete always makes progress and grouping stays valid.
  */
  if (digits === previousDigits && raw.length < previousDisplay.length && digits.length > 0) {
    const index = inputType === "deleteContentForward" ? digitsBeforeCaret : digitsBeforeCaret - 1;
    if (index >= 0 && index < digits.length) {
      digits = digits.slice(0, index) + digits.slice(index + 1);
      const display = groupDigits(digits);
      return { digits, display, caret: offsetAfterDigits(display, index) };
    }
  }

  /*
    The edit only inserted rejected characters (letters, symbols) or a leading
    zero: the value did not change, so keep the caret where the insertion was
    instead of re-deriving it from the digit count.
  */
  if (digits === previousDigits && raw.length > previousDisplay.length) {
    const inserted = raw.length - previousDisplay.length;
    const position = Math.min(Math.max(caret - inserted, 0), previousDisplay.length);
    return { digits, display: previousDisplay, caret: position };
  }

  /* Leading zeros are dropped before the caret, so shift the digit index too. */
  const leadingZeros = rawDigits.length - rawDigits.replace(/^0+(?=\d)/, "").length;
  const digitIndex = Math.min(Math.max(digitsBeforeCaret - leadingZeros, 0), digits.length);
  const display = groupDigits(digits);

  return { digits, display, caret: offsetAfterDigits(display, digitIndex) };
}
