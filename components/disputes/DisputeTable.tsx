import type { Dispute, Recommendation } from "@/contracts";
import { formatDeadline, formatPaise } from "@/lib/format";
import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { StoredRecommendation } from "./StoredRecommendation";

const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400";
const td = "px-4 py-3 align-middle text-sm";

type Props = {
  disputes: Dispute[];
  now: Date;
  /** Latest stored recommendation per dispute id; a missing key means "Not run yet". */
  recommendations: ReadonlyMap<string, Recommendation>;
  isMockAgent: boolean;
};

export function DisputeTable({ disputes, now, recommendations, isMockAgent }: Props) {
  if (disputes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        No disputes yet. Run <code className="font-mono">npm run db:seed</code> to add demo cases.
      </p>
    );
  }

  return (
    <div
      role="region"
      aria-label="Disputes table"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <table className="w-full min-w-[44rem] border-collapse">
        <caption className="px-4 py-3 text-left text-sm text-zinc-600 dark:text-zinc-400">
          Open payment disputes, with the deadline for responding and the latest recommended next action.
        </caption>
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th scope="col" className={th}>Dispute id</th>
            <th scope="col" className={`${th} text-right`}>Amount</th>
            <th scope="col" className={th}>Reason code</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Deadline</th>
            <th scope="col" className={th}>Recommendation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {disputes.map((dispute) => (
            <tr key={dispute.id}>
              <th scope="row" className={`${td} text-left font-mono font-medium`}>
                <Link
                  href={`/disputes/${encodeURIComponent(dispute.id)}`}
                  className="underline underline-offset-2 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:hover:text-indigo-300"
                >
                  {dispute.id}
                </Link>
              </th>
              <td className={`${td} text-right tabular-nums`}>{formatPaise(dispute.amount)}</td>
              <td className={`${td} font-mono`}>{dispute.reasonCode}</td>
              <td className={td}><StatusBadge status={dispute.status} /></td>
              <td className={td}>
                <time dateTime={dispute.deadline} title={dispute.deadline}>
                  {formatDeadline(dispute.deadline, now)}
                </time>
              </td>
              <td className={td}><StoredRecommendation recommendation={recommendations.get(dispute.id)} isMock={isMockAgent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
