import { getPendingApproval, getLatestApproval } from "@/lib/db/repositories/approvals";
import { getDispute } from "@/lib/db/repositories/disputes";
import { getLatestRecommendation } from "@/lib/db/repositories/recommendations";
import type { ActionState } from "@/app/disputes/[id]/schemas";
import { ApprovalForm, type ResolveApprovalAction } from "./ApprovalForm";
import { ApprovalOutcome } from "./ApprovalOutcome";
import { RecommendationCard } from "./RecommendationCard";
import { RunAgentButton } from "./RunAgentButton";

type Props = {
  disputeId: string;
  /** Server Actions come in as props (wired by the page) so components never import app/. */
  runAgent: (disputeId: string) => Promise<ActionState>;
  resolveApproval: ResolveApprovalAction;
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
export async function AgentPanel({ disputeId, runAgent, resolveApproval, isMockAgent = true }: Props) {
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
    return (
      <Shell>
        <div className="space-y-4">
          <ApprovalOutcome status={status} approval={approval} />
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
