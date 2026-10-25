import { describe, expect, it } from "vitest";
import {
  applyMoneyInputEdit,
  applyMoneyValueEdit,
  countDigitsBefore,
  extractDigits,
  formatMoneyInputValue,
  groupDigits,
  normalizeMoneyValue,
  MAX_IDR_DIGITS,
  normalizeDigits,
  offsetAfterDigits,
} from "./money-input";

/*
  T-013 unit evidence for the shared IDR input helper (design 01 §5.8).
  The helper never parses or stores decimals: it only moves digit strings
  between the form state and the grouped display.
*/

const GROUPED = /^(\d{1,3}(\.\d{3})*)?$/;

function typeAt(
  display: string,
  caret: number,
  text: string,
  previousDigits: string,
  inputType = "insertText",
) {
  const raw = display.slice(0, caret) + text + display.slice(caret);
  return applyMoneyInputEdit({
    raw,
    caret: caret + text.length,
    previousDigits,
    inputType,
    data: text,
  });
}

function backspaceAt(display: string, caret: number, previousDigits: string) {
  const raw = display.slice(0, Math.max(caret - 1, 0)) + display.slice(caret);
  return applyMoneyInputEdit({
    raw,
    caret: Math.max(caret - 1, 0),
    previousDigits,
    inputType: "deleteContentBackward",
  });
}

function deleteForwardAt(display: string, caret: number, previousDigits: string) {
  const raw = display.slice(0, caret) + display.slice(caret + 1);
  return applyMoneyInputEdit({
    raw,
    caret,
    previousDigits,
    inputType: "deleteContentForward",
  });
}

function pasteAt(display: string, caret: number, text: string, previousDigits: string) {
  return typeAt(display, caret, text, previousDigits, "insertFromPaste");
}

/** Replace a selected range (simulates select-all or a partial selection). */
function replaceRange(
  display: string,
  start: number,
  end: number,
  text: string,
  previousDigits: string,
) {
  const raw = display.slice(0, start) + text + display.slice(end);
  return applyMoneyInputEdit({
    raw,
    caret: start + text.length,
    previousDigits,
    inputType: "insertFromPaste",
    data: text,
  });
}

/** Type plain text over a selected range, as a keyboard keystroke would. */
function typeOverRange(
  display: string,
  start: number,
  end: number,
  text: string,
  previousDigits: string,
) {
  const raw = display.slice(0, start) + text + display.slice(end);
  return applyMoneyInputEdit({
    raw,
    caret: start + text.length,
    previousDigits,
    inputType: "insertText",
    data: text,
  });
}

/** Type a whole digit string one key at a time, like a real keyboard. */
function typeDigits(digits: string) {
  let value = "";
  let display = "";
  let caret = 0;
  for (const digit of digits) {
    const next = typeAt(display, caret, digit, value);
    value = next.digits;
    display = next.display;
    caret = next.caret;
  }
  return { digits: value, display, caret };
}

describe("extractDigits", () => {
  it("keeps the integer digits of formatted rupiah", () => {
    expect(extractDigits("Rp 2.500.000")).toBe("2500000");
    expect(extractDigits("2.500.000")).toBe("2500000");
    expect(extractDigits("2500000")).toBe("2500000");
    expect(extractDigits("12500/00")).toBe("1250000");
  });

  it("drops the decimal part instead of concatenating it", () => {
    expect(extractDigits("Rp12.500.000,00")).toBe("12500000");
    expect(extractDigits("12.500,00")).toBe("12500");
    expect(extractDigits("1.234.567,89")).toBe("1234567");
    expect(extractDigits("1,234.56")).toBe("1234");
    expect(extractDigits("Rp 2.500.000,-")).toBe("2500000");
  });

  it("returns an empty string when there are no digits", () => {
    expect(extractDigits("Rp")).toBe("");
    expect(extractDigits("abc,.-+")).toBe("");
    expect(extractDigits("")).toBe("");
  });
});

describe("decimal amount input", () => {
  it.each([
    ["3,000.12", "3000.12", "3.000,12"],
    ["5,120.43", "5120.43", "5.120,43"],
    ["3.000,12", "3000.12", "3.000,12"],
    ["5120,43", "5120.43", "5.120,43"],
  ])("normalizes %s to %s and displays %s", (input, value, display) => {
    expect(normalizeMoneyValue(input)).toBe(value);
    expect(formatMoneyInputValue(value)).toBe(display);
  });

  it("keeps typing commas, grouping separators, and two decimal places live", () => {
    const states = [
      ["3,", "3.", "3,"],
      ["3,0", "3.0", "3,0"],
      ["3,00", "3.00", "3,00"],
      ["3,000", "3000", "3.000"],
      ["3.000.", "3000.", "3.000,"],
      ["3.000,1", "3000.1", "3.000,1"],
      ["3.000,12", "3000.12", "3.000,12"],
    ];
    for (const [raw, value, display] of states) {
      const result = applyMoneyValueEdit({ raw, caret: raw.length, previousDigits: "" });
      expect(result.digits).toBe(value);
      expect(result.display).toBe(display);
    }
  });
});

describe("normalizeDigits", () => {
  it("drops leading zeros", () => {
    expect(normalizeDigits("000123")).toBe("123");
    expect(normalizeDigits("007")).toBe("7");
  });

  it("keeps a lone zero so an explicit 0 can still be shown", () => {
    expect(normalizeDigits("0")).toBe("0");
    expect(normalizeDigits("000")).toBe("0");
  });

  it("keeps the integer part and drops the decimal part", () => {
    expect(normalizeDigits("Rp 2.500.000")).toBe("2500000");
    expect(normalizeDigits("Rp12.500.000,00")).toBe("12500000");
    expect(normalizeDigits("12.500,00")).toBe("12500");
    expect(normalizeDigits("1.234.567,89")).toBe("1234567");
    expect(normalizeDigits("1,234.56")).toBe("1234");
    expect(normalizeDigits("2500000")).toBe("2500000");
    expect(normalizeDigits("Rp 2.500.000,-")).toBe("2500000");
  });

  it("caps the digit count at 10 digits", () => {
    expect(MAX_IDR_DIGITS).toBe(10);
    expect(normalizeDigits("12345678901")).toBe("1234567890");
    expect(normalizeDigits("12345", 4)).toBe("1234");
    expect(normalizeDigits("")).toBe("");
  });
});

describe("groupDigits", () => {
  it("groups thousands with dots", () => {
    expect(groupDigits("22000000")).toBe("22.000.000");
    expect(groupDigits("2500000")).toBe("2.500.000");
    expect(groupDigits("1000")).toBe("1.000");
    expect(groupDigits("999")).toBe("999");
    expect(groupDigits("2147483647")).toBe("2.147.483.647");
  });

  it("keeps empty and single-digit values untouched", () => {
    expect(groupDigits("")).toBe("");
    expect(groupDigits("7")).toBe("7");
  });
});

describe("caret mapping", () => {
  it("counts only digits before the offset", () => {
    expect(countDigitsBefore("22.000.000", 0)).toBe(0);
    expect(countDigitsBefore("22.000.000", 2)).toBe(2);
    expect(countDigitsBefore("22.000.000", 3)).toBe(2);
    expect(countDigitsBefore("22.000.000", 4)).toBe(3);
    expect(countDigitsBefore("22.000.000", 999)).toBe(8);
  });

  it("maps a digit count back to the display offset", () => {
    expect(offsetAfterDigits("22.000.000", 0)).toBe(0);
    expect(offsetAfterDigits("22.000.000", 2)).toBe(2);
    expect(offsetAfterDigits("22.000.000", 3)).toBe(4);
    expect(offsetAfterDigits("22.000.000", 8)).toBe(10);
    expect(offsetAfterDigits("", 3)).toBe(0);
  });
});

describe("typing digits", () => {
  it("groups live on every keystroke and keeps the caret at the end", () => {
    const states = [
      ["2", "2"],
      ["22", "22"],
      ["220", "220"],
      ["2200", "2.200"],
      ["22000", "22.000"],
      ["220000", "220.000"],
      ["2200000", "2.200.000"],
      ["22000000", "22.000.000"],
    ];

    let value = "";
    let display = "";
    let caret = 0;
    for (const [expectedDigits, expectedDisplay] of states) {
      const next = typeAt(display, caret, expectedDigits.slice(-1), value);
      value = next.digits;
      display = next.display;
      caret = next.caret;
      expect(display).toBe(expectedDisplay);
      expect(value).toBe(expectedDigits);
      expect(caret).toBe(display.length);
    }
  });

  it("ignores letters and symbols without moving the caret", () => {
    for (const rejected of ["a", "Z", "+", "-", " ", "/", "Rp"]) {
      const next = typeAt("22.000.000", 3, rejected, "22000000");
      expect(next.digits).toBe("22000000");
      expect(next.display).toBe("22.000.000");
      expect(next.caret).toBe(3);
    }
  });

  it("keeps the caret on the edited digit when typing in the middle", () => {
    const middle = typeAt("22.000.000", 2, "5", "22000000");
    expect(middle.digits).toBe("225000000");
    expect(middle.display).toBe("225.000.000");
    expect(middle.caret).toBe(3);

    const afterSeparator = typeAt("22.000.000", 3, "5", "22000000");
    expect(afterSeparator.display).toBe("225.000.000");
    expect(afterSeparator.caret).toBe(3);

    const atStart = typeAt("22.000.000", 0, "9", "22000000");
    expect(atStart.digits).toBe("922000000");
    expect(atStart.display).toBe("922.000.000");
    expect(atStart.caret).toBe(1);
  });

  it("inserts a digit before an existing group separator", () => {
    const next = typeAt("2.500", 1, "7", "2500");
    expect(next.digits).toBe("27500");
    expect(next.display).toBe("27.500");
    expect(next.caret).toBe(2);
  });
});

describe("rejected keystrokes over a selection", () => {
  it("keeps the selected digits when typing a letter or symbol", () => {
    for (const typed of ["a", "Z", "+", "-", " "]) {
      const next = typeOverRange("22.000.000", 3, 6, typed, "22000000");
      expect(next.digits).toBe("22000000");
      expect(next.display).toBe("22.000.000");
      expect(next.caret).toBe(3);
      expect(next.selectionEnd).toBe(6);
    }
  });

  it("keeps the selected digits when a letter replaces the whole value", () => {
    const next = typeOverRange("2.500", 0, 5, "a", "2500");
    expect(next.digits).toBe("2500");
    expect(next.display).toBe("2.500");
    expect(next.caret).toBe(0);
    expect(next.selectionEnd).toBe(5);
  });

  it("still accepts a digit typed over a selection", () => {
    const next = typeOverRange("22.000.000", 3, 6, "5", "22000000");
    expect(next.digits).toBe("225000");
    expect(next.display).toBe("225.000");
    expect(next.caret).toBe(3);
  });
});

describe("backspace", () => {
  it("deletes the last digit and regroups", () => {
    const next = backspaceAt("2.500.000", 9, "2500000");
    expect(next.digits).toBe("250000");
    expect(next.display).toBe("250.000");
    expect(next.caret).toBe(7);
  });

  it("deletes the digit before the caret and regroups", () => {
    const next = backspaceAt("2.500.000", 3, "2500000");
    expect(next.digits).toBe("200000");
    expect(next.display).toBe("200.000");
    expect(next.caret).toBe(1);
    expect(next.display).not.toMatch(/\.\./);
  });

  it("skips a separator and deletes the digit before it", () => {
    const next = backspaceAt("2.500.000", 2, "2500000");
    expect(next.digits).toBe("500000");
    expect(next.display).toBe("500.000");
    expect(next.caret).toBe(0);
  });

  it("never produces a broken group when deleting across separators", () => {
    const next = backspaceAt("2.500.000", 6, "2500000");
    expect(next.display).toMatch(GROUPED);
    expect(next.digits).toBe("250000");
  });

  it("leaves an empty field after select-all plus delete", () => {
    const next = applyMoneyInputEdit({
      raw: "",
      caret: 0,
      previousDigits: "2500000",
      inputType: "deleteContentBackward",
    });
    expect(next.digits).toBe("");
    expect(next.display).toBe("");
    expect(next.caret).toBe(0);
  });

  it("is a no-op at the start of the field", () => {
    const next = backspaceAt("2.500", 0, "2500");
    expect(next.display).toBe("2.500");
    expect(next.digits).toBe("2500");
    expect(next.caret).toBe(0);
  });

  it("keeps every intermediate display valid while clearing a field", () => {
    let value = "2500000";
    let display = groupDigits(value);
    let caret = display.length;
    for (let step = 0; step < 20 && display.length > 0; step += 1) {
      const next = backspaceAt(display, caret, value);
      value = next.digits;
      display = next.display;
      caret = next.caret;
      expect(display).toMatch(GROUPED);
      expect(display).toBe(groupDigits(value));
    }
    expect(display).toBe("");
    expect(value).toBe("");
  });
});

describe("forward delete", () => {
  it("deletes the digit after a separator instead of stalling", () => {
    const next = deleteForwardAt("2.500.000", 1, "2500000");
    expect(next.digits).toBe("200000");
    expect(next.display).toBe("200.000");
    expect(next.caret).toBe(1);
  });
});

describe("paste", () => {
  it("normalizes a formatted rupiah paste", () => {
    const next = pasteAt("", 0, "Rp 2.500.000", "");
    expect(next.digits).toBe("2500000");
    expect(next.display).toBe("2.500.000");
    expect(next.caret).toBe(9);
  });

  it("normalizes a plain digit paste", () => {
    const next = pasteAt("", 0, "2500000", "");
    expect(next.digits).toBe("2500000");
    expect(next.display).toBe("2.500.000");
  });

  it("drops the decimal-comma part from a formatted rupiah paste", () => {
    const next = pasteAt("", 0, "Rp12.500.000,00", "");
    expect(next.digits).toBe("12500000");
    expect(next.display).toBe("12.500.000");
    expect(next.caret).toBe(10);
  });

  it("accepts a comma as an optional thousands separator", () => {
    expect(normalizeDigits("100,000")).toBe("100000");
    expect(normalizeDigits("100000")).toBe("100000");
    expect(groupDigits(normalizeDigits("100,000"))).toBe("100.000");
  });

  it("drops the decimal-comma part of a short amount", () => {
    const next = pasteAt("", 0, "12.500,00", "");
    expect(next.digits).toBe("12500");
    expect(next.display).toBe("12.500");
  });

  it("handles English-order decimals by taking the last separator", () => {
    const next = pasteAt("", 0, "1,234.56", "");
    expect(next.digits).toBe("1234");
    expect(next.display).toBe("1.234");
  });

  it("strips stray symbols and trailing noise", () => {
    const next = pasteAt("", 0, "Rp 2.500.000,-", "");
    expect(next.digits).toBe("2500000");
    expect(next.display).toBe("2.500.000");
  });

  it("drops leading zeros from a paste", () => {
    const next = pasteAt("", 0, "000123", "");
    expect(next.digits).toBe("123");
    expect(next.display).toBe("123");
    expect(next.caret).toBe(3);
  });

  it("replaces the selection and puts the caret after the pasted digits", () => {
    const next = replaceRange("2.500", 0, 5, "Rp 3.000", "2500");
    expect(next.digits).toBe("3000");
    expect(next.display).toBe("3.000");
    expect(next.caret).toBe(5);
  });
});

describe("leading zeros and maximum digits", () => {
  it("normalizes zeros typed before a value", () => {
    expect(typeDigits("000123")).toEqual({ digits: "123", display: "123", caret: 3 });
  });
  it("caps typed digits at 10 without moving the caret to the start", () => {
    const next = typeDigits("12345678901");
    expect(next.digits).toBe("1234567890");
    expect(next.display).toBe("1.234.567.890");
    expect(next.caret).toBe(13);
  });

  it("rejects an extra digit once the cap is reached", () => {
    const next = typeAt("1.234.567.890", 13, "9", "1234567890");
    expect(next.digits).toBe("1234567890");
    expect(next.display).toBe("1.234.567.890");
    expect(next.caret).toBe(13);
  });

  it("honours a smaller maxDigits", () => {
    const next = applyMoneyInputEdit({
      raw: "12345",
      caret: 5,
      previousDigits: "",
      maxDigits: 4,
    });
    expect(next.digits).toBe("1234");
    expect(next.display).toBe("1.234");
    expect(next.caret).toBe(5);
  });
});
