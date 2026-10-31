import type { ActionLogEntry } from "@/contracts";
import { ActorIcon, ACTOR_LABEL } from "@/components/ui/ActorIcon";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime, formatPaiseInText, humanizeEnum } from "@/lib/format";
import { outcomeLabel, outcomeTone } from "./outcome";

export function ActionLogTimeline({ entries }: { entries: ActionLogEntry[] }) {
  return (
    <section aria-labelledby="action-log-heading">
      <h2 id="action-log-heading" className="text-lg font-semibold">Action log</h2>
      <div className="mt-3">
        {entries.length === 0 ? (
          <EmptyState title="No agent actions recorded yet" />
        ) : (
          <Card as="ol" className="divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3 p-3">
                <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-muted">
                  <ActorIcon actor={entry.actor} className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    <span className="sr-only">{ACTOR_LABEL[entry.actor]}, </span>
                    <time dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)}</time>
                    <Badge>{humanizeEnum(entry.step)}</Badge>
                    <Badge tone={outcomeTone(entry.outcome)}>{outcomeLabel(entry.outcome)}</Badge>
                    {entry.confidence !== undefined && <span>Confidence {Math.round(entry.confidence * 100)}%</span>}
                  </p>
                  {/* Display only: stored text keeps its paise amounts. */}
                  <p className="mt-1 break-words text-sm">{formatPaiseInText(entry.summary)}</p>
                </div>
              </li>
            ))}
          </Card>
        )}
      </div>
    </section>
  );
}
