import type { ReactNode } from "react";

/** A label / value list. Pair with <Fact>. Long values wrap instead of widening the page. */
export function FactList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
