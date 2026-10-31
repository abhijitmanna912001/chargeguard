import { Inbox } from "lucide-react";
import Link from "next/link";
import type { Dispute, Recommendation } from "@/contracts";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDeadline, formatPaise, isDeadlineUrgent } from "@/lib/format";
import { reasonLabel } from "@/lib/reason-codes";
import { StoredRecommendation } from "./StoredRecommendation";

const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted";
// Below md every table element is display:block, so each row becomes a card.
const td = "max-md:block md:px-4 md:py-3 md:align-middle";

type Props = {
  disputes: Dispute[];
  now: Date;
  /** Latest stored recommendation per dispute id; a missing key means "Not run yet". */
  recommendations: ReadonlyMap<string, Recommendation>;
  isMockAgent: boolean;
};

/**
 * One table that is a real <table> from md up and stacked cards below it.
 * The whole row is the link: the id link stretches over the row with a
 * pseudo-element, so there is still exactly one link per row.
 */
export function DisputeTable({ disputes, now, recommendations, isMockAgent }: Props) {
  if (disputes.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-6" />}
        title="No disputes yet"
        description="Run npm run db:seed to add demo cases."
      />
    );
  }

  return (
    <div className="md:overflow-hidden md:rounded-lg md:border md:border-line md:bg-surface">
      <table className="w-full border-collapse max-md:block">
        <caption className="sr-only">
          Payment disputes, with the deadline for responding and the latest recommended next action.
        </caption>
        <thead className="max-md:sr-only">
          <tr className="border-b border-line bg-canvas">
            <th scope="col" className={th}>Dispute</th>
            <th scope="col" className={`${th} text-right`}>Amount</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Deadline</th>
            <th scope="col" className={th}>Recommendation</th>
          </tr>
        </thead>
        <tbody className="max-md:block max-md:space-y-3 md:divide-y md:divide-line">
          {disputes.map((dispute) => {
            const urgent = isDeadlineUrgent(dispute.deadline, now);
            return (
              <tr
                key={dispute.id}
                className="relative hover:bg-canvas has-[a:focus-visible]:bg-canvas max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-4 max-md:gap-y-2 max-md:rounded-lg max-md:border max-md:border-line max-md:bg-surface max-md:p-4"
              >
                <th scope="row" className={`${td} text-left font-normal`}>
                  <Link
                    href={`/disputes/${encodeURIComponent(dispute.id)}`}
                    className="block break-all rounded-sm font-mono text-sm font-semibold after:absolute after:inset-0 after:content-['']"
                  >
                    {dispute.id}
                  </Link>
                  <span className="mt-1 block text-sm text-ink-muted">{reasonLabel(dispute.reasonCode)}</span>
                </th>
                <td className={`${td} text-sm font-semibold tabular-nums md:text-right max-md:text-right`}>
                  {formatPaise(dispute.amount)}
                </td>
                <td className={td}><StatusBadge status={dispute.status} /></td>
                <td className={`${td} text-sm max-md:text-right ${urgent ? "font-semibold text-danger-fg" : "text-ink-muted"}`}>
                  <time dateTime={dispute.deadline} title={dispute.deadline}>
                    {formatDeadline(dispute.deadline, now)}
                  </time>
                </td>
                <td className={`${td} max-md:col-span-2`}>
                  <StoredRecommendation recommendation={recommendations.get(dispute.id)} isMock={isMockAgent} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
