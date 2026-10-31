import type { ReactNode } from "react";

type Props = { title: string; description?: string; children?: ReactNode };

/** The one error panel for route error boundaries. Children are the actions (retry button, back link). */
export function ErrorState({
  title,
  description = "Something went wrong on our side. Your data is safe. Please try again in a moment.",
  children,
}: Props) {
  return (
    <div role="alert" className="rounded-lg border border-danger-line bg-danger-bg p-6 text-danger-fg">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm">{description}</p>
      {children && <div className="mt-4 flex flex-wrap items-center gap-4">{children}</div>}
    </div>
  );
}
