import { cn } from "@/lib/utils";

type CardVariant = "white" | "peach" | "lavender" | "mint" | "sky";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

/*
  Pastel washes come from docs/design/01-design-system-tokens.md section 2.2.
  Each variant carries a matching border so the card edge stays visible on the
  off-white canvas without relying on a heavy shadow.
*/
const variantClasses: Record<CardVariant, string> = {
  white: "bg-white border-slate-100",
  peach: "bg-gradient-to-br from-orange-100/70 via-amber-50/60 to-rose-50/50 border-orange-200/50",
  lavender:
    "bg-gradient-to-br from-purple-100/80 via-indigo-50/70 to-purple-50/40 border-purple-200/60",
  mint: "bg-gradient-to-br from-emerald-100/70 via-teal-50/60 to-green-50/40 border-emerald-200/50",
  sky: "bg-gradient-to-br from-sky-100/70 via-blue-50/60 to-indigo-50/40 border-sky-200/50",
};

export function Card({
  variant = "white",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-6 shadow-bento",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
