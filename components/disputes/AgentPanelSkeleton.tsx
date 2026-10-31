export function AgentPanelSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mt-10">
      <span className="sr-only">Loading agent panel…</span>
      <div aria-hidden="true" className="animate-pulse space-y-3">
        <div className="h-5 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
