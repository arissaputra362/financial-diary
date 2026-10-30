/*
  Date helpers shared by server and client. Calendar decisions use the
  Asia/Jakarta calendar (A-12/A-13); incoming timestamps are ISO UTC strings.
  Pure module: no server imports, safe in client components.
*/

const JAKARTA_TZ = "Asia/Jakarta";

const dateOnlyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const labelFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: JAKARTA_TZ,
});

/** `YYYY-MM-DD` on the Asia/Jakarta calendar. */
export function toJakartaDateOnly(date: Date = new Date()): string {
  const parts = dateOnlyFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayJakarta(): string {
  return toJakartaDateOnly(new Date());
}

export function yesterdayJakarta(): string {
  return toJakartaDateOnly(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

/** Human date label for an ISO instant or a date-only string, e.g. "22 Okt 2026". */
export function formatDateLabel(value: string): string {
  const date = value.length === 10 ? new Date(`${value}T12:00:00+07:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return labelFormatter.format(date);
}

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: JAKARTA_TZ,
});

/** Human clock label for an ISO instant, e.g. "14.30", on the Asia/Jakarta clock. */
export function formatTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return timeFormatter.format(date);
}

/** Date plus clock label for an ISO instant, e.g. "22 Okt 2026, 14.30". */
export function formatDateTimeLabel(value: string): string {
  const time = formatTimeLabel(value);
  if (!time) return formatDateLabel(value);
  return `${formatDateLabel(value)}, ${time}`;
}

/** Jakarta date-only key for an ISO instant; used to group list rows per day. */
export function jakartaDateKey(value: string): string {
  return toJakartaDateOnly(new Date(value));
}

const monthLabelFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: JAKARTA_TZ,
});

function isMonthKey(key: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

/** Parse `YYYY-MM` into a `[year, monthNumber]` pair, falling back to this month. */
function parseMonthKey(key: string): [number, number] {
  if (isMonthKey(key)) {
    const [year, month] = key.split("-").map(Number);
    if (year !== undefined && month !== undefined) return [year, month];
  }
  const fallback = toJakartaDateOnly(new Date());
  return [Number(fallback.slice(0, 4)), Number(fallback.slice(5, 7))];
}

/** `YYYY-MM` for the current Asia/Jakarta month, e.g. "2026-10". */
export function currentMonthKey(): string {
  return toJakartaDateOnly(new Date()).slice(0, 7);
}

/**
 * Normalize a `?month=` query param into a valid `YYYY-MM` key.
 * Anything malformed (or absent) falls back to the current month so a shared
 * or edited deep link can never crash the list.
 */
export function resolveMonthKey(value: string | undefined | null): string {
  if (value && isMonthKey(value)) return value;
  return currentMonthKey();
}

/** `YYYY-MM` for the previous (-1) or next (+1) Jakarta month. */
export function shiftMonthKey(key: string, delta: -1 | 1): string {
  const [year, month] = parseMonthKey(key);
  /* Day 1 in UTC avoids any month-rollover edge; UTC midnight is same-day Jakarta. */
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Inclusive date range label, e.g. "1 Okt 2026 sampai 31 Okt 2026". */
export function formatDateRangeLabel(start: string, end: string): string {
  return `${formatDateLabel(start)} sampai ${formatDateLabel(end)}`;
}

/** Human label for a month key, e.g. "Oktober 2026". */
export function monthKeyLabel(key: string): string {
  const [year, month] = parseMonthKey(key);
  return monthLabelFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** First and last date-only strings of a month key, for the list API `from`/`to`. */
export function monthKeyRange(key: string): { from: string; to: string } {
  const [year, month] = parseMonthKey(key);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  /* Day 0 of the following month is the last day of this month. */
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from,
    to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}