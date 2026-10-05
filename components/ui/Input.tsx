import { forwardRef } from "react";
import { Field, controlClasses } from "./Field";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
  isLoading?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, error, helperText, isLoading, required, className, ...props },
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
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${id}-error` : helperText ? `${id}-helper` : undefined
        }
        className={controlClasses(Boolean(error))}
        {...props}
      />
    </Field>
  );
});
