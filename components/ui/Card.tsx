import { cn } from "@/lib/utils";

type CardVariant = "default" | "tint" | "mint" | "danger" | "navy";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

/*
  Surfaces from docs/design/01-design-system-tokens.md §2.1 and §2.4.
  Variant names are semantic: tint (Bersama context), mint (targets/success),
  danger (error/denial), navy (structural dark panels). Cards stay flat with a
  hairline border and the shared bento shadow, never a gradient.
*/
const variantClasses: Record<CardVariant, string> = {
  default: "border-[#D8E2EE] bg-white",
  tint: "border-[#BCD6EF] bg-[#DCEBFA]",
  mint: "border-[#BBE5C7] bg-[#DCFCE7]",
  danger: "border-[#F3C2C2] bg-[#FDECEC]",
  navy: "border-white/10 bg-[#14273F] text-white",
};

export function Card({
  variant = "default",
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
