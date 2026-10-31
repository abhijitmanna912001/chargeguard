export function CaseFileSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading dispute…</span>
      <div aria-hidden="true" className="animate-pulse space-y-8">
        <div className="h-28 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-3">
          <div className="h-5 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-32 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-32 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-5 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-12 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
