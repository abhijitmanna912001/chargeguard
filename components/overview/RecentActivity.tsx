import Link from "next/link";
import type { ActionLogEntry } from "@/contracts";
import { ActorIcon, ACTOR_LABEL } from "@/components/ui/ActorIcon";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";
import { History } from "lucide-react";

export function RecentActivity({ entries }: { entries: readonly ActionLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-6" />}
        title="No agent activity yet"
        description="Entries appear here as the agent and your team act on disputes."
      />
    );
  }
  return (
    <Card as="ul" className="divide-y divide-line">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 p-4">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-muted"
          >
            <ActorIcon actor={e.actor} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">{e.summary}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {ACTOR_LABEL[e.actor]} ·{" "}
              <Link href={`/disputes/${encodeURIComponent(e.disputeId)}`} className="font-mono underline underline-offset-2 hover:text-ink">
                {e.disputeId}
              </Link>{" "}
              · <time dateTime={e.timestamp}>{formatDateTime(e.timestamp)}</time>
            </p>
          </div>
        </li>
      ))}
    </Card>
  );
}
