import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  leading?: ReactNode;
  beforeTitle?: ReactNode;
  actions?: ReactNode;
  actionsClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  className?: string;
}

/** Shared heading structure for the app's top-level pages. */
export function PageHeader({
  title,
  eyebrow,
  description,
  icon: Icon,
  iconClassName,
  leading,
  beforeTitle,
  actions,
  actionsClassName,
  titleClassName,
  descriptionClassName,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0">
          {beforeTitle}
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              "mt-1 flex min-w-0 items-center gap-2 text-2xl font-bold tracking-tight text-ink",
              titleClassName,
            )}
          >
            {Icon ? (
              <Icon
                className={cn("h-5 w-5 shrink-0 text-blue", iconClassName)}
                aria-hidden="true"
              />
            ) : null}
            {title}
          </h1>
          {description ? (
            <p className={cn("mt-1 text-sm text-ink-3", descriptionClassName)}>
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div
          className={cn(
            "flex w-full flex-col items-stretch gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:items-center",
            actionsClassName,
          )}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
