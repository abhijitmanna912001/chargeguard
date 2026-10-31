import { CalendarClock } from "lucide-react";
import type { Dispute } from "@/contracts";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime, formatDeadline, formatPaise, isDeadlineUrgent } from "@/lib/format";
import { reasonLabel } from "@/lib/reason-codes";

type Props = { dispute: Dispute; now: Date };

export function DisputeSummary({ dispute, now }: Props) {
  const urgent = isDeadlineUrgent(dispute.deadline, now);
  return (
    <section aria-labelledby="summary-heading">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="summary-heading" className="min-w-0 break-all font-mono text-lg font-semibold">{dispute.id}</h2>
          <StatusBadge status={dispute.status} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-sm text-ink-muted">Amount</p>
            <p className="text-3xl font-semibold tabular-nums">{formatPaise(dispute.amount)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-ink-muted">Reason</p>
            <p className="text-base font-medium">{reasonLabel(dispute.reasonCode)}</p>
          </div>
          <div>
            <p className="text-sm text-ink-muted">Respond by</p>
            <p className={`flex items-center gap-1.5 text-base font-semibold ${urgent ? "text-danger-fg" : ""}`}>
              <CalendarClock aria-hidden="true" className="size-4" />
              <time dateTime={dispute.deadline}>{formatDeadline(dispute.deadline, now)}</time>
            </p>
            <p className="text-sm text-ink-muted">{formatDateTime(dispute.deadline)}</p>
          </div>
        </div>
      </Card>
    </section>
  );
}
