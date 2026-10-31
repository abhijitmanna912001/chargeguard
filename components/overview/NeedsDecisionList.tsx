import { CircleCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Dispute, Recommendation } from "@/contracts";
import { ActionBadge } from "@/components/disputes/ActionBadge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDeadline, formatPaise, isDeadlineUrgent } from "@/lib/format";
import { reasonLabel } from "@/lib/reason-codes";

type Props = {
  disputes: readonly Dispute[];
  now: Date;
  /** Latest stored recommendation per dispute id. A dispute with none shows no badge. */
  recommendations?: ReadonlyMap<string, Recommendation>;
};

export function NeedsDecisionList({ disputes, now, recommendations }: Props) {
  if (disputes.length === 0) {
    return (
      <EmptyState
        icon={<CircleCheck className="size-6" />}
        title="Nothing waiting for you"
        description="When the agent has a recommendation that needs a decision, it will show up here."
      />
    );
  }
  return (
    <Card as="ul" className="divide-y divide-line">
      {disputes.map((d) => {
        const urgent = isDeadlineUrgent(d.deadline, now);
        const recommendation = recommendations?.get(d.id);
        return (
          <li key={d.id}>
            <Link
              href={`/disputes/${encodeURIComponent(d.id)}`}
              className="flex items-center gap-4 rounded-lg p-4 hover:bg-canvas"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold">{d.id}</p>
                <p className="mt-1 text-sm text-ink-muted">{reasonLabel(d.reasonCode)}</p>
                {recommendation && (
                  <p className="mt-2 flex flex-col items-start gap-1 text-xs text-ink-muted sm:flex-row sm:items-center sm:gap-2">
                    Agent recommends <ActionBadge action={recommendation.finalAction} />
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{formatPaise(d.amount)}</p>
                <p className={`mt-1 text-sm ${urgent ? "font-semibold text-danger-fg" : "text-ink-muted"}`}>
                  <time dateTime={d.deadline}>{formatDeadline(d.deadline, now)}</time>
                </p>
              </div>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
            </Link>
          </li>
        );
      })}
    </Card>
  );
}
