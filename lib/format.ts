/**
 * Money is stored as exact decimal rupiah values (see AGENTS.md §5 "Data Format").
 * DTO fields retain the historical `Minor` suffix; values are not subunits.
 */

/*
  Use a plain decimal formatter and prepend "Rp" manually. The Intl currency
  style for id-ID emits "Rp 1.250.000" (with a space), but the canonical design
  string is "Rp1.250.000" (no space) — see docs/design/05-ai-advisor-panel.md.
*/
const idrNumberFormatter = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Normalize a stored amount so negative zero never leaks into output. */
function normalizeMinor(amountMinor: number): number {
  const rounded = Math.round((amountMinor + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Format a rupiah amount, for example 1250000.12 -> "Rp1.250.000,12".
 */
export function formatIDR(amountMinor: number): string {
  const value = normalizeMinor(amountMinor);
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${idrNumberFormatter.format(Math.abs(value))}`;
}

/**
 * Format a rupiah amount with an explicit sign, for example "+Rp1.250.000,12".
 * Used where the direction of money matters more than the raw value.
 * The input is a rupiah value; values may have up to two decimal places.
 */
export function formatSignedIDR(amountMinor: number): string {
  const value = normalizeMinor(amountMinor);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}Rp${idrNumberFormatter.format(Math.abs(value))}`;
}
