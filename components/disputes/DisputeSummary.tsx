import type { Dispute } from "@/contracts";
import { formatDateTime, formatDeadline, formatPaise } from "@/lib/format";
import { MockRecommendation } from "./MockRecommendation";
import { StatusBadge } from "./StatusBadge";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export function DisputeSummary({ dispute, now }: { dispute: Dispute; now: Date }) {
  return (
    <section aria-labelledby="summary-heading" className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 id="summary-heading" className="font-mono text-lg font-semibold">{dispute.id}</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
        <Item label="Amount"><span className="text-base font-semibold tabular-nums">{formatPaise(dispute.amount)}</span></Item>
        <Item label="Reason code"><span className="font-mono">{dispute.reasonCode}</span></Item>
        <Item label="Status"><StatusBadge status={dispute.status} /></Item>
        <Item label="Deadline">
          <time dateTime={dispute.deadline}>{formatDeadline(dispute.deadline, now)}</time>
          <span className="block text-xs text-zinc-600 dark:text-zinc-400">{formatDateTime(dispute.deadline)}</span>
        </Item>
        <Item label="Recommendation"><MockRecommendation dispute={dispute} /></Item>
      </dl>
    </section>
  );
}
