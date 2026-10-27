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
    "bg-brand-green text-white shadow-pill hover:bg-brand-green-hover active:scale-[0.98]",
  secondary:
    "border border-blue-border bg-card text-blue shadow-sm hover:bg-blue-wash active:scale-[0.98]",
  ghost:
    "text-ink-2 hover:bg-blue-wash hover:text-ink active:scale-[0.98]",
  danger:
    "bg-brand-danger text-white shadow-sm hover:bg-brand-danger-hover active:scale-[0.98]",
  ai: "bg-brand-blue text-white shadow-sm hover:bg-brand-blue-hover active:scale-[0.98]",
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
          "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-chip-slate disabled:text-ink-2 disabled:shadow-none disabled:active:scale-100",
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
