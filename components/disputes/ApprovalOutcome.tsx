import type { ApprovalRequest, DisputeStatus } from "@/contracts";
import { Card } from "@/components/ui/Card";
import { Fact, FactList } from "@/components/ui/FactList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime, humanizeEnum } from "@/lib/format";

function outcomeText(approval: ApprovalRequest): string {
  if (approval.status === "approved") return `Approved: ${approval.resolvedAction ?? "no action recorded"}`;
  if (approval.status === "rejected") return "Rejected: handled manually, no response sent by the agent";
  return "Still pending";
}

export function ApprovalOutcome({ status, approval }: { status: DisputeStatus; approval: ApprovalRequest | null }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Outcome</h3>
        <StatusBadge status={status} />
      </div>
      {status === "submitted" && (
        <p className="mt-3 text-sm">A response was submitted to the simulated provider. A submitted response is not a won dispute.</p>
      )}
      {approval === null ? (
        <p className="mt-3 text-sm text-ink-muted">No approval record was found for this dispute.</p>
      ) : (
        <div className="mt-4">
          <FactList>
            <Fact label="Decision">{outcomeText(approval)}</Fact>
            <Fact label="Agent proposed">{humanizeEnum(approval.proposedAction)}</Fact>
            {approval.decidedBy && (
              <Fact label="Decided by"><span className="font-mono">{approval.decidedBy}</span></Fact>
            )}
            {approval.decidedAt && (
              <Fact label="Decided at">
                <time dateTime={approval.decidedAt}>{formatDateTime(approval.decidedAt)}</time>
              </Fact>
            )}
            <Fact label="Note">{approval.note ?? "No note"}</Fact>
          </FactList>
        </div>
      )}
    </Card>
  );
}
