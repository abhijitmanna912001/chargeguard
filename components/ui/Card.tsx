import type { ElementType, ReactNode } from "react";

type Props = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

/** A white panel with a thin border. No shadow. */
export function Card({ as: Tag = "div", className = "", children }: Props) {
  return <Tag className={`rounded-lg border border-line bg-surface ${className}`}>{children}</Tag>;
}
