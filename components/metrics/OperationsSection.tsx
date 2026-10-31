import type { OperationalMetrics } from "@/lib/metrics/operations";
import { formatSeconds, type ApprovalOutcomeKey } from "@/lib/metrics/aggregate";
import { humanizeEnum } from "@/lib/format";

const th = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400";
const td = "px-3 py-3 text-sm";

const OUTCOME_LABEL: Record<ApprovalOutcomeKey, string> = {
  pending: "Pending",
  approved_defend: "Approved: defend",
  approved_accept: "Approved: accept",
  rejected: "Rejected",
};

function MetricTable({
  caption,
  labelHeading,
  rows,
}: {
  caption: string;
  labelHeading: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[18rem] border-collapse">
        <caption className="px-3 py-3 text-left text-sm font-medium">{caption}</caption>
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th scope="col" className={th}>{labelHeading}</th>
            <th scope="col" className={`${th} text-right`}>Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className={`${td} text-left font-normal`}>{r.label}</th>
              <td className={`${td} text-right tabular-nums`}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OperationsSection({ metrics }: { metrics: OperationalMetrics }) {
  const t = metrics.timeToDecision;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <MetricTable
        caption={`Disputes by status (${metrics.totalDisputes} in total)`}
        labelHeading="Status"
        rows={metrics.disputesByStatus.map((r) => ({ label: humanizeEnum(r.status), value: String(r.count) }))}
      />
      <MetricTable
        caption="Approvals by outcome"
        labelHeading="Outcome"
        rows={metrics.approvalsByOutcome.map((r) => ({ label: OUTCOME_LABEL[r.outcome], value: String(r.count) }))}
      />
      <MetricTable
        caption="Time to decision, from the first log entry to the human decision"
        labelHeading="Measure"
        rows={[
          { label: "Disputes decided", value: String(t.count) },
          { label: "Median", value: t.medianSeconds === null ? "No decisions yet" : formatSeconds(t.medianSeconds) },
          { label: "Slowest", value: t.maxSeconds === null ? "No decisions yet" : formatSeconds(t.maxSeconds) },
        ]}
      />
    </div>
  );
}
