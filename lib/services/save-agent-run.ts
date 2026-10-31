// The only place (with other lib/services modules) allowed to open a database
// transaction. Repositories take the transaction client as their last argument.
import type { ActionLogEntry, ApprovalRequest, Dispute, Recommendation } from "../../contracts";
import { prisma } from "../db/prisma";
import { appendActionLog } from "../db/repositories/action-log";
import { createApprovalRequest } from "../db/repositories/approvals";
import { getDispute, transitionDisputeStatus } from "../db/repositories/disputes";
import { createRecommendation } from "../db/repositories/recommendations";
import { AgentRunMismatchError, DisputeNotFoundError, DisputeNotReadyError } from "./errors";

export type SaveAgentRunInput = {
  disputeId: string;
  recommendation: Recommendation;
  actionLog: ActionLogEntry[];
  /** Identity of the approval request; the rest is derived from the recommendation. */
  approval: { id: string; requestedAt: string };
};

const SAVEABLE_FROM = ["received", "gathering"] as const;

/**
 * Saves one agent run all-or-nothing: recommendation, every log entry, a
 * pending approval and the move to awaiting_approval. Any failure rolls back
 * everything, leaving the dispute exactly as it was.
 */
export async function saveAgentRun(input: SaveAgentRunInput): Promise<{
  recommendation: Recommendation;
  actionLog: ActionLogEntry[];
  approval: ApprovalRequest;
}> {
  const { disputeId, recommendation, actionLog, approval } = input;

  for (const item of [recommendation, ...actionLog]) {
    if (item.disputeId !== disputeId) throw new AgentRunMismatchError(disputeId, item.id);
  }

  return prisma.$transaction(async (tx) => {
    // The status guard is an atomic conditional UPDATE: it takes the row lock,
    // so two concurrent saves cannot both pass it.
    const moved = await transitionDisputeStatus(disputeId, SAVEABLE_FROM, "awaiting_approval", tx);
    if (!moved) {
      const current: Dispute | null = await getDispute(disputeId, tx);
      if (!current) throw new DisputeNotFoundError(disputeId);
      throw new DisputeNotReadyError(disputeId, current.status);
    }

    const savedRecommendation = await createRecommendation(recommendation, tx);
    const savedLog: ActionLogEntry[] = [];
    for (const entry of actionLog) savedLog.push(await appendActionLog(entry, tx));
    const savedApproval = await createApprovalRequest(
      {
        id: approval.id,
        disputeId,
        recommendationId: savedRecommendation.id,
        requestedAt: approval.requestedAt,
        flags: savedRecommendation.flags,
        proposedAction: savedRecommendation.finalAction,
        status: "pending",
      },
      tx,
    );
    return { recommendation: savedRecommendation, actionLog: savedLog, approval: savedApproval };
  });
}
