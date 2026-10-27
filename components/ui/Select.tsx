import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { Field, controlClasses } from "./Field";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  helperText?: string;
  isLoading?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    label,
    options,
    placeholder,
    error,
    helperText,
    isLoading,
    required,
    className,
    ...props
  },
  ref,
) {
  return (
    <Field
      id={id}
      label={label}
      error={error}
      helperText={helperText}
      isLoading={isLoading}
      required={required}
      className={className}
    >
      <div className="relative">
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${id}-error` : helperText ? `${id}-helper` : undefined
          }
          className={`${controlClasses(Boolean(error))} appearance-none pr-10`}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-placeholder"
          aria-hidden="true"
        />
      </div>
    </Field>
  );
});
