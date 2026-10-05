import { forwardRef } from "react";
import { Field, controlClasses } from "./Field";

export interface TextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
  isLoading?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    { id, label, error, helperText, isLoading, required, rows = 3, ...props },
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
      >
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${id}-error` : helperText ? `${id}-helper` : undefined
          }
          className={`${controlClasses(Boolean(error))} resize-y`}
          {...props}
        />
      </Field>
    );
  },
);
