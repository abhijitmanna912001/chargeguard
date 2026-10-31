// One place that maps a tone name to its token utilities. Class names are
// written out in full so Tailwind can see them.
export type Tone = "neutral" | "brand" | "accent" | "success" | "warning" | "caution" | "danger";

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-neutral-bg text-neutral-fg border-neutral-line",
  brand: "bg-brand-bg text-brand-fg border-brand-line",
  accent: "bg-accent-bg text-accent-fg border-accent-line",
  success: "bg-success-bg text-success-fg border-success-line",
  warning: "bg-warning-bg text-warning-fg border-warning-line",
  caution: "bg-caution-bg text-caution-fg border-caution-line",
  danger: "bg-danger-bg text-danger-fg border-danger-line",
};
