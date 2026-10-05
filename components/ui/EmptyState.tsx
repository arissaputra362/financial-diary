import { Card } from "./Card";

export interface EmptyStateProps {
  title: string;
  description: string;
  /** Optional action, for example a button that starts the first entry. */
  action?: React.ReactNode;
}

/**
 * Shown when a data view has nothing to display yet.
 * The copy invites the next step instead of just reporting emptiness.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl"
      >
        🗒️
      </span>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="max-w-sm text-[15px] leading-relaxed text-slate-600">
        {description}
      </p>
      {action ? <div className="mt-1">{action}</div> : null}
    </Card>
  );
}
