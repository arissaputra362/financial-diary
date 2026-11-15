export const ACTIVITY_NOTE_MAX_LENGTH = 32;

export function truncateActivityText(value: string): string {
  if (value.length <= ACTIVITY_NOTE_MAX_LENGTH) return value;
  return `${value.slice(0, ACTIVITY_NOTE_MAX_LENGTH - 1).trimEnd()}…`;
}
