/*
  Asia/Jakarta calendar helpers (A-12, A-13, D-14).

  All calendar math (date-only conversion, future-date validation, day ranges)
  uses the Asia/Jakarta calendar, never the server process clock. Jakarta has no
  DST, so a fixed +07:00 offset is correct for every date in scope.
*/

const JAKARTA_OFFSET = "+07:00";
const JAKARTA_TZ = "Asia/Jakarta";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date in Asia/Jakarta as `YYYY-MM-DD`. */
export function jakartaDateOnly(date: Date = new Date()): string {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True when a `YYYY-MM-DD` date is after today on the Jakarta calendar. */
export function isFutureDateOnly(dateOnly: string, now: Date = new Date()): boolean {
  return dateOnly > jakartaDateOnly(now);
}

/** D 12:00 Asia/Jakarta → UTC instant (D-14 / A-12). */
export function dateOnlyToNoonJakarta(dateOnly: string): Date {
  return new Date(`${dateOnly}T12:00:00${JAKARTA_OFFSET}`);
}

export function startOfJakartaDay(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00${JAKARTA_OFFSET}`);
}

export function endOfJakartaDay(dateOnly: string): Date {
  return new Date(`${dateOnly}T23:59:59.999${JAKARTA_OFFSET}`);
}
