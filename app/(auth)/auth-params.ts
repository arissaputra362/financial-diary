/*
  Shared parsing for auth routes. `?redirect=` must stay inside the app:
  protocol-relative and absolute URLs are ignored so a crafted link cannot
  bounce a freshly signed-in user off-site.
*/

export function readRedirect(value: string | string[] | undefined): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/transactions";
  return candidate;
}

export function readInviteCode(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}
