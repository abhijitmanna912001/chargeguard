import type { ReactNode } from "react";

type Props = { icon?: ReactNode; title: string; description?: string; action?: ReactNode };

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-surface px-6 py-8 text-center">
      {icon && <div aria-hidden="true" className="mb-2 text-ink-subtle">{icon}</div>}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
