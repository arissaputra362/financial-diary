import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind sizing classes, for example "h-4 w-32". */
  className?: string;
}

/** Neutral placeholder block used while real data is loading. */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-2xl bg-bar-track motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
