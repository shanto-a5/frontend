"use client";

import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Form field shell: visible label, optional description, and an error slot
 * wired with `aria-describedby`/`aria-invalid` so screen readers announce the
 * same problem sighted users see (WCAG 3.3.1/3.3.3).
 */

interface FieldShellProps {
  label: string;
  description?: string;
  error?: string;
  htmlFor: string;
  describedBy?: string;
  children: React.ReactNode;
}

export function FieldShell({ label, description, error, htmlFor, describedBy, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {description && (
        <p id={describedBy ? `${describedBy}-description` : undefined} className="text-sm text-ink-muted">
          {description}
        </p>
      )}
      {children}
      {error && (
        <p id={describedBy ? `${describedBy}-error` : undefined} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL_CLASSES =
  "w-full min-h-11 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-primary " +
  "disabled:bg-canvas disabled:text-ink-muted";

const invalidClasses = (hasError: boolean) => (hasError ? "border-danger" : "");

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, description, error, className, id, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `input-${reactId}`;
  const describedBy = error ? `${inputId}-error` : description ? `${inputId}-description` : undefined;
  return (
    <FieldShell label={label} description={description} error={error} htmlFor={inputId} describedBy={inputId}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(CONTROL_CLASSES, invalidClasses(!!error), className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  description?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, description, error, className, id, rows = 5, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `textarea-${reactId}`;
  const describedBy = error ? `${inputId}-error` : description ? `${inputId}-description` : undefined;
  return (
    <FieldShell label={label} description={description} error={error} htmlFor={inputId} describedBy={inputId}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(CONTROL_CLASSES, "min-h-24 resize-y", invalidClasses(!!error), className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  description?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, description, error, className, id, children, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `select-${reactId}`;
  const describedBy = error ? `${inputId}-error` : description ? `${inputId}-description` : undefined;
  return (
    <FieldShell label={label} description={description} error={error} htmlFor={inputId} describedBy={inputId}>
      <select
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(CONTROL_CLASSES, "appearance-none pr-8", invalidClasses(!!error), className)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});
