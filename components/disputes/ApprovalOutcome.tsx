import type { ApprovalRequest, DisputeStatus } from "@/contracts";
import { formatDateTime, humanizeEnum } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

function outcomeText(approval: ApprovalRequest): string {
  if (approval.status === "approved") return `Approved: ${approval.resolvedAction ?? "no action recorded"}`;
  if (approval.status === "rejected") return "Rejected: handled manually, no response sent by the agent";
  return "Still pending";
}

export function ApprovalOutcome({ status, approval }: { status: DisputeStatus; approval: ApprovalRequest | null }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Outcome</h3>
      <p className="mt-2">
        <StatusBadge status={status} />
      </p>
      {status === "submitted" && (
        <p className="mt-2 text-sm">A response was submitted. A submitted response is not a won dispute.</p>
      )}
      {approval === null ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No approval record was found for this dispute.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-zinc-600 dark:text-zinc-400">Decision</dt>
          <dd>{outcomeText(approval)}</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Agent proposed</dt>
          <dd>{humanizeEnum(approval.proposedAction)}</dd>
          {approval.decidedBy && (
            <>
              <dt className="text-zinc-600 dark:text-zinc-400">Decided by</dt>
              <dd className="font-mono">{approval.decidedBy}</dd>
            </>
          )}
          {approval.decidedAt && (
            <>
              <dt className="text-zinc-600 dark:text-zinc-400">Decided at</dt>
              <dd>
                <time dateTime={approval.decidedAt}>{formatDateTime(approval.decidedAt)}</time>
              </dd>
            </>
          )}
          <dt className="text-zinc-600 dark:text-zinc-400">Note</dt>
          <dd className="break-words">{approval.note ?? "No note"}</dd>
        </dl>
      )}
    </div>
  );
}
