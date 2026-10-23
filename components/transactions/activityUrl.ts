/*
  One URL writer for the Activity page (AC-F3-14). The Add sheet intent is the
  single `add=1` parameter; the selected month and the Trash tab travel with it
  so closing the sheet only removes the intent and never resets the view.
*/

export type ActivityViewMode = "active" | "trash";

export interface ActivityHrefInput {
  view: ActivityViewMode;
  month: string;
  add?: boolean;
}

export function activityHref({ view, month, add = false }: ActivityHrefInput): string {
  const params = new URLSearchParams();
  if (view === "trash") params.set("view", "trash");
  params.set("month", month);
  if (add) params.set("add", "1");
  return `/transactions?${params.toString()}`;
}
