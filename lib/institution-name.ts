/*
  Institution-name normalization (T-011 / A-54, A-57).

  One pure helper is shared by the server (Quick Add, duplicate detection,
  search) and the client picker so both compare names identically. It is not a
  server-only module: the rule is Unicode NFKC, trim, collapse internal
  whitespace, then case-fold with `toLowerCase()`.

  The stored `normalized_name` is the case-folded result. The display name keeps
  the user's (trimmed) casing.
*/

export const INSTITUTION_NAME_MAX_LENGTH = 80;

export function normalizeInstitutionName(input: string): string {
  return input.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

/** True when `query` occurs in an already-normalized institution name. */
export function institutionMatchesQuery(normalizedName: string, query: string): boolean {
  return normalizedName.includes(normalizeInstitutionName(query));
}
