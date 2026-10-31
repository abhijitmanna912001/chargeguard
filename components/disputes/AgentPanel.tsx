import { getPendingApproval, getLatestApproval } from "@/lib/db/repositories/approvals";
import { getDispute } from "@/lib/db/repositories/disputes";
import { getLatestRecommendation, getRecommendation } from "@/lib/db/repositories/recommendations";
import { getSubmissionByKey } from "@/lib/db/repositories/submissions";
import { buildDefensePackage } from "@/lib/services/defense-package";
import { defenseIdempotencyKey } from "@/lib/services/submit-defense";
import type { ActionState } from "@/app/disputes/[id]/schemas";
import { ApprovalForm, type ResolveApprovalAction } from "./ApprovalForm";
import { ApprovalOutcome } from "./ApprovalOutcome";
import { DefensePackageCard } from "./DefensePackageCard";
import { RecommendationCard } from "./RecommendationCard";
import { RunAgentButton } from "./RunAgentButton";
import { SubmissionResultCard } from "./SubmissionResultCard";
import { SubmitDefenseButton } from "./SubmitDefenseButton";

type Props = {
  disputeId: string;
  /** Server Actions come in as props (wired by the page) so components never import app/. */
  runAgent: (disputeId: string) => Promise<ActionState>;
  resolveApproval: ResolveApprovalAction;
  submitDefense: (disputeId: string) => Promise<ActionState>;
  /** True while the mock agent is the only agent; keeps the "Mock" tag on recommendations. */
  isMockAgent?: boolean;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="agent-panel-heading" className="mt-10">
      <h2 id="agent-panel-heading" className="text-lg font-semibold">Agent</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const muted = "text-sm text-zinc-600 dark:text-zinc-400";

// Reads live status every render (no "use cache"): a stale status could show a
// decision form for an already-decided dispute.
export async function AgentPanel({ disputeId, runAgent, resolveApproval, submitDefense, isMockAgent = true }: Props) {
  const dispute = await getDispute(disputeId);
  if (!dispute) return null;
  const { status } = dispute;

  if (status === "received" || status === "gathering") {
    return (
      <Shell>
        <p className="text-sm">
          The agent has not looked at this dispute yet. Running it gathers the evidence, recommends whether to defend,
          accept or escalate, and then waits for your approval. Nothing is sent to the network.
        </p>
        <RunAgentButton action={runAgent.bind(null, disputeId)} />
      </Shell>
    );
  }

  if (status === "awaiting_approval") {
    const [recommendation, approval] = await Promise.all([
      getLatestRecommendation(disputeId),
      getPendingApproval(disputeId),
    ]);
    if (!recommendation || !approval) {
      return (
        <Shell>
          <p className={muted}>This dispute is waiting for approval, but its approval request could not be loaded. Refresh the page.</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <RecommendationCard recommendation={recommendation} isMock={isMockAgent} />
        <ApprovalForm
          disputeId={disputeId}
          approvalId={approval.id}
          proposedAction={approval.proposedAction}
          flags={recommendation.flags}
          action={resolveApproval}
        />
      </Shell>
    );
  }

  if (status === "decided" || status === "accepted" || status === "escalated" || status === "submitted") {
    const [recommendation, approval] = await Promise.all([
      getLatestRecommendation(disputeId),
      getLatestApproval(disputeId),
    ]);
    // Same lookup the submit service uses: the approved recommendation and the
    // submission under the deterministic key for this approval.
    const submission = approval ? await getSubmissionByKey(defenseIdempotencyKey(disputeId, approval.id)) : null;
    const canSubmit = status === "decided" && approval?.status === "approved" && approval.resolvedAction === "defend";
    const defendRecommendation = canSubmit ? await getRecommendation(approval.recommendationId) : null;
    return (
      <Shell>
        <div className="space-y-4">
          <ApprovalOutcome status={status} approval={approval} />
          {status === "submitted" && submission && <SubmissionResultCard submission={submission} />}
          {canSubmit &&
            (defendRecommendation ? (
              <div>
                <DefensePackageCard pkg={buildDefensePackage(dispute, defendRecommendation)} />
                {submission?.status === "failed" && (
                  <p role="alert" className="mt-3 text-sm font-medium text-red-800 dark:text-red-300">
                    The last simulated submission failed: {submission.errorMessage ?? "no reason recorded"}
                  </p>
                )}
                <SubmitDefenseButton
                  action={submitDefense.bind(null, disputeId)}
                  isRetry={submission?.status === "failed"}
                />
              </div>
            ) : (
              <p className={muted}>The defense package could not be built because its recommendation is missing.</p>
            ))}
          {recommendation && <RecommendationCard recommendation={recommendation} isMock={isMockAgent} />}
        </div>
      </Shell>
    );
  }

  // expired: the deadline passed, so there is nothing to run or decide.
  return (
    <Shell>
      <p className={muted}>This dispute has expired. The agent cannot act on it.</p>
    </Shell>
  );
}
