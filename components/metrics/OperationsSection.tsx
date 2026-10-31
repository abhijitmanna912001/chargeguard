import type { OperationalMetrics } from "@/lib/metrics/operations";
import { formatSeconds, type ApprovalOutcomeKey } from "@/lib/metrics/aggregate";
import { Card } from "@/components/ui/Card";
import { humanizeEnum } from "@/lib/format";

const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted";
const td = "px-4 py-3 text-sm";

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
    <Card>
      <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-lg">
        <table className="w-full border-collapse">
          <caption className="px-4 py-3 text-left text-sm font-semibold">{caption}</caption>
          <thead className="border-y border-line">
            <tr>
              <th scope="col" className={th}>{labelHeading}</th>
              <th scope="col" className={`${th} text-right`}>Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className={`${td} text-left font-normal`}>{r.label}</th>
                <td className={`${td} text-right tabular-nums`}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function OperationsSection({ metrics }: { metrics: OperationalMetrics }) {
  const t = metrics.timeToDecision;
  return (
    <div className="grid items-start gap-4 md:grid-cols-3">
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
