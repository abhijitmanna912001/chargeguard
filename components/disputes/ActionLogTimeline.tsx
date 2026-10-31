import type { ActionLogEntry } from "@/contracts";
import { formatDateTime, humanizeEnum } from "@/lib/format";

export function ActionLogTimeline({ entries }: { entries: ActionLogEntry[] }) {
  return (
    <section aria-labelledby="action-log-heading" className="mt-10">
      <h2 id="action-log-heading" className="text-lg font-semibold">Action log</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No agent actions recorded yet.</p>
      ) : (
        <ol className="mt-4 space-y-4 border-l-2 border-zinc-200 pl-5 dark:border-zinc-800">
          {entries.map((entry) => (
            <li key={entry.id}>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                <time dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)}</time>
                <span className="rounded border border-zinc-400 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-zinc-800 dark:text-zinc-200">
                  {entry.step}
                </span>
                <span>By {entry.actor}</span>
                {entry.confidence !== undefined && (
                  <span>Confidence {Math.round(entry.confidence * 100)}%</span>
                )}
              </p>
              <p className="mt-1 text-sm">{entry.summary}</p>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                Outcome: {humanizeEnum(entry.outcome)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
