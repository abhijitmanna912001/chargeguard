import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

const BASE =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-ink bg-ink text-ink-on hover:bg-ink-hover",
  secondary: "border-field-line bg-surface text-ink hover:bg-canvas",
  danger: "border-danger-solid bg-danger-solid text-ink-on hover:bg-danger-solid-hover",
};

/** Class string for things that should look like a button, such as a Link. */
export function buttonClasses(variant: ButtonVariant = "primary"): string {
  return `${BASE} ${VARIANT[variant]}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Shows a spinner and disables the button. Keep the label; it still says what the button does. */
  loading?: boolean;
};

export function Button({ variant = "primary", loading = false, disabled, className = "", children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClasses(variant)} ${className}`}
      {...rest}
    >
      {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
