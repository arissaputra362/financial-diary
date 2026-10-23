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

/* Doc 01 §5.1: one filled green primary, outlined secondary, blue AI accent. */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[#166534] text-white shadow-pill hover:bg-[#155C30] active:scale-[0.98]",
  secondary:
    "border border-[#BFD3E8] bg-white text-[#1D4F87] shadow-sm hover:bg-[#EFF4FA] active:scale-[0.98]",
  ghost:
    "text-[#46597A] hover:bg-[#EFF4FA] hover:text-[#17304F] active:scale-[0.98]",
  danger:
    "bg-[#B91C1C] text-white shadow-sm hover:bg-[#991B1B] active:scale-[0.98]",
  ai: "bg-[#1D4F87] text-white shadow-sm hover:bg-[#173F6C] active:scale-[0.98]",
};

/* Every size keeps a tap target of at least 44px (doc 01 §6.4). */
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
          "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#E6ECF4] disabled:text-[#46597A] disabled:shadow-none disabled:active:scale-100",
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
