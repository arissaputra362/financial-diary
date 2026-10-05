import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "ai";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks while an action is in flight. */
  isLoading?: boolean;
  /** Text announced to screen readers while loading. */
  loadingLabel?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-slate-900 text-white hover:bg-slate-800 shadow-sm active:scale-[0.98]",
  secondary:
    "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm active:scale-[0.98]",
  ghost: "text-slate-600 hover:bg-slate-100 active:scale-[0.98]",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 shadow-sm active:scale-[0.98]",
  ai: "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-95 shadow-md shadow-purple-500/20 active:scale-[0.98]",
};

/* Every size keeps a tap target of at least 44px (R-03). */
const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingLabel = "Sedang memproses",
      disabled,
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
