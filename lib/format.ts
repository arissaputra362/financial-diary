/**
 * Money is stored as an integer in minor units. For IDR the scale is 0:
 * 1 minor unit = 1 rupiah (see AGENTS.md §5 "Data Format" and the money ADR).
 * Do NOT divide by 100 — every display helper takes the stored integer as-is.
 */

/*
  Use a plain decimal formatter and prepend "Rp" manually. The Intl currency
  style for id-ID emits "Rp 1.250.000" (with a space), but the canonical design
  string is "Rp1.250.000" (no space) — see docs/design/05-ai-advisor-panel.md.
*/
const idrNumberFormatter = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Normalize a stored amount so negative zero never leaks into output. */
function normalizeMinor(amountMinor: number): number {
  return amountMinor === 0 ? 0 : amountMinor;
}

/**
 * Format a stored amount as rupiah, for example 1250000 -> "Rp1.250.000".
 * The input is minor units = rupiah directly (scale 0).
 */
export function formatIDR(amountMinor: number): string {
  const value = normalizeMinor(amountMinor);
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${idrNumberFormatter.format(Math.abs(value))}`;
}

/**
 * Format a stored amount with an explicit sign, for example "+Rp1.250.000".
 * Used where the direction of money matters more than the raw value.
 * The input is minor units = rupiah directly (scale 0).
 */
export function formatSignedIDR(amountMinor: number): string {
  const value = normalizeMinor(amountMinor);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}Rp${idrNumberFormatter.format(Math.abs(value))}`;
}
