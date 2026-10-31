import type { ReactNode } from "react";

/** A grey placeholder block. Size it with className so the loaded content does not shift the page. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-line ${className}`} />;
}

/** Wraps skeleton blocks as one polite loading status with a text label for screen readers. */
export function SkeletonGroup({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
