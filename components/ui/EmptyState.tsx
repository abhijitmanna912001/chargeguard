import type { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  /** Use "h1" when the empty state is the whole page (the 404 page). */
  titleAs?: "p" | "h1";
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, titleAs: Title = "p", description, action }: Props) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-surface px-6 py-8 text-center">
      {icon && <div aria-hidden="true" className="mb-2 text-ink-subtle">{icon}</div>}
      <Title className="text-sm font-semibold">{title}</Title>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
