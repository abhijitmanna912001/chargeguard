const ROWS = 4;

export function TableSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <span className="sr-only">Loading disputes…</span>
      <div aria-hidden="true" className="animate-pulse divide-y divide-zinc-200 dark:divide-zinc-800">
        <div className="h-10 bg-zinc-100 dark:bg-zinc-900" />
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="hidden h-4 w-12 rounded bg-zinc-200 sm:block dark:bg-zinc-800" />
            <div className="h-5 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="hidden h-4 w-24 rounded bg-zinc-200 sm:block dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
