// Pure decision rules for human approvals. No database, no framework.
import type { Action, ResolvedAction } from "../../contracts";

export type Decision = "approved" | "rejected";

/** Basic shape rule: approved needs defend|accept, rejected must have none. */
export function checkDecisionShape(decision: Decision, resolvedAction: ResolvedAction | undefined): string | null {
  if (decision === "approved" && resolvedAction === undefined) return "An approval needs a resolved action (defend or accept)";
  if (decision === "rejected" && resolvedAction !== undefined) return "A rejection must not have a resolved action";
  return null;
}

/** Dispute status after a decision. */
export function nextDisputeStatus(
  decision: Decision,
  resolvedAction: ResolvedAction | undefined,
): "decided" | "accepted" | "escalated" {
  if (decision === "rejected") return "escalated";
  return resolvedAction === "accept" ? "accepted" : "decided";
}

export type ProposalCheck =
  | { ok: true; resolvedAction: ResolvedAction | undefined }
  | { ok: false; code: "must_match_proposal" | "action_required" | "action_not_allowed" };

/**
 * Applies the agent's proposal to what the human asked for.
 * - reject: no resolved action allowed.
 * - approve of defend/accept: resolves to exactly that action (omitted = take it; different = refused).
 * - approve of escalate: the human must choose defend or accept.
 */
export function resolveAgainstProposal(
  proposedAction: Action,
  decision: Decision,
  requested: ResolvedAction | undefined,
): ProposalCheck {
  if (decision === "rejected") {
    return requested === undefined
      ? { ok: true, resolvedAction: undefined }
      : { ok: false, code: "action_not_allowed" };
  }
  if (proposedAction === "escalate") {
    return requested === undefined
      ? { ok: false, code: "action_required" }
      : { ok: true, resolvedAction: requested };
  }
  if (requested !== undefined && requested !== proposedAction) return { ok: false, code: "must_match_proposal" };
  return { ok: true, resolvedAction: proposedAction };
}
