import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FieldProps {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
  isLoading?: boolean;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Shared label, helper, error, and loading shell for form controls.
 * Micro-labels are the only place uppercase 12px text is allowed (doc 01 §3).
 */
export function Field({
  id,
  label,
  error,
  helperText,
  isLoading = false,
  required = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wider text-[#46597A]"
      >
        {label}
        {required ? (
          <span className="ml-1 text-[#B91C1C]" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        {children}
        {isLoading ? (
          <Loader2
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#5C7191]"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-[#B91C1C]">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${id}-helper`} className="text-xs text-[#5C6C86]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

/** Shared control styling so Input, Select, and TextArea stay consistent. */
export const controlClasses = (hasError: boolean) =>
  cn(
    "w-full rounded-2xl border bg-white px-4 py-3 text-[15px] text-[#17304F]",
    "placeholder:text-[#5C6C86] transition-colors",
    "focus:outline-none focus:ring-4",
    "disabled:cursor-not-allowed disabled:bg-[#EFF4FA] disabled:text-[#46597A]",
    hasError
      ? "border-[#B91C1C] focus:border-[#B91C1C] focus:ring-[#B91C1C]/15"
      : "border-[#C9D6E4] focus:border-[#1D4F87] focus:ring-[#1D4F87]/15",
  );
