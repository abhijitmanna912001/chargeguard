// One human decision, all-or-nothing: resolve the approval, move the dispute,
// write the audit entry. Any failure rolls all three back.
import type { ActionLogEntry, ApprovalRequest, DisputeStatus, ResolvedAction } from "../../contracts";
import { prisma } from "../db/prisma";
import { appendActionLog } from "../db/repositories/action-log";
import { getApproval, resolveApproval } from "../db/repositories/approvals";
import { getDispute, transitionDisputeStatus } from "../db/repositories/disputes";
import { checkDecisionShape, nextDisputeStatus, type Decision } from "./approval-rules";
import {
  ApprovalDisputeMismatchError,
  DisputeNotFoundError,
  DisputeNotReadyError,
  InvalidDecisionError,
} from "./errors";
import { ApprovalAlreadyResolvedError } from "../db/errors";

export type ResolveApprovalInput = {
  disputeId: string;
  approvalId: string;
  decision: Decision;
  resolvedAction?: ResolvedAction;
  decidedBy: string;
  note?: string;
  now: Date;
  createId: () => string;
};

export type ResolveApprovalResult = {
  approval: ApprovalRequest;
  disputeStatus: DisputeStatus;
  logEntry: ActionLogEntry;
};

export async function resolveApprovalWorkflow(input: ResolveApprovalInput): Promise<ResolveApprovalResult> {
  const { disputeId, approvalId, decision, resolvedAction, decidedBy, note, now, createId } = input;

  // Rule check first: nothing touches the database for an invalid decision.
  const problem = checkDecisionShape(decision, resolvedAction);
  if (problem) throw new InvalidDecisionError(problem);
  const toStatus = nextDisputeStatus(decision, resolvedAction);

  return prisma.$transaction(async (tx) => {
    const existing = await getApproval(approvalId, tx);
    if (!existing) throw new ApprovalAlreadyResolvedError(approvalId);
    if (existing.disputeId !== disputeId) throw new ApprovalDisputeMismatchError(approvalId, disputeId);

    // Exactly-once guard: conditional UPDATE, so a concurrent decider loses.
    const approval = await resolveApproval(
      approvalId,
      { status: decision, resolvedAction, decidedBy, note },
      tx,
      now,
    );

    const moved = await transitionDisputeStatus(disputeId, ["awaiting_approval"], toStatus, tx);
    if (!moved) {
      const current = await getDispute(disputeId, tx);
      if (!current) throw new DisputeNotFoundError(disputeId);
      throw new DisputeNotReadyError(disputeId, current.status);
    }

    const logEntry = await appendActionLog(
      {
        id: createId(),
        disputeId,
        timestamp: now.toISOString(),
        step: "approve",
        actor: "human",
        summary: decision === "approved" ? `Approved: ${resolvedAction}` : "Rejected: sent to human escalation",
        evidenceRefs: [],
        outcome: decision === "approved" ? `approved_${resolvedAction}` : "rejected",
      },
      tx,
    );

    return { approval, disputeStatus: toStatus, logEntry };
  });
}
