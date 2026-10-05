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
 * Keeps the three controls visually identical without repeating markup.
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
        className="text-xs font-medium uppercase tracking-wider text-slate-600"
      >
        {label}
        {required ? (
          <span className="ml-1 text-rose-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        {children}
        {isLoading ? (
          <Loader2
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${id}-helper`} className="text-xs text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

/** Shared control styling so Input, Select, and TextArea stay consistent. */
export const controlClasses = (hasError: boolean) =>
  cn(
    "w-full rounded-2xl border bg-white px-4 py-3 text-[15px] text-slate-900",
    "placeholder:text-slate-400 transition-colors",
    "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
    hasError
      ? "border-rose-400 focus:border-rose-500"
      : "border-slate-200 focus:border-slate-400",
  );
