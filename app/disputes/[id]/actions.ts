"use server";

import { revalidatePath } from "next/cache";
import { getAgentRunner } from "@/app/agent-mode";
import { DEMO_MERCHANT_ID } from "@/lib/demo-merchant";
import { ApprovalAlreadyResolvedError } from "@/lib/db/errors";
import { getApproval } from "@/lib/db/repositories/approvals";
import { resolveAgainstProposal } from "@/lib/services/approval-rules";
import {
  ApprovalDisputeMismatchError,
  DisputeNotFoundError,
  DisputeNotReadyError,
  ProviderSubmissionFailedError,
  SubmissionNotAllowedError,
} from "@/lib/services/errors";
import { resolveApprovalWorkflow } from "@/lib/services/resolve-approval";
import { runAgentForDispute } from "@/lib/services/run-agent-workflow";
import { submitDefense } from "@/lib/services/submit-defense";
import { decodeApprovalChoice, ResolveApprovalInputSchema, RunAgentInputSchema, SubmitDefenseInputSchema, type ActionState } from "./schemas";

const INVALID: ActionState = { ok: false, message: "That request was not valid. Please check it and try again." };
const NOT_READY: ActionState = { ok: false, message: "This dispute is not ready for that step." };
const ALREADY_DECIDED: ActionState = { ok: false, message: "Someone else has already decided this approval." };
const GENERIC: ActionState = { ok: false, message: "Something went wrong. Please try again." };

// Pages read the database directly (no "use cache"), so revalidatePath is enough:
// it re-renders the open page inside this action's response and clears the client
// router cache. No tags exist, so updateTag has nothing to expire.
function revalidateDispute(disputeId: string) {
  revalidatePath(`/disputes/${disputeId}`);
  revalidatePath("/disputes");
}

export async function runAgentAction(disputeId: string): Promise<ActionState> {
  const parsed = RunAgentInputSchema.safeParse({ disputeId });
  if (!parsed.success) return INVALID;

  try {
    const result = await runAgentForDispute(parsed.data.disputeId, {
      now: () => new Date(),
      createId: () => crypto.randomUUID(),
      runAgent: getAgentRunner(),
    });
    if (!result.ok) {
      revalidateDispute(parsed.data.disputeId);
      return result.reason === "not_found"
        ? { ok: false, message: "We could not find that dispute." }
        : NOT_READY;
    }
    // Server-side telemetry only (attempts, latency, tokens; no prompt or
    // evidence). Not stored and not sent to the client. null in mock mode.
    if (result.modelCallMetadata) {
      console.info("runAgentAction model call", { disputeId: parsed.data.disputeId, ...result.modelCallMetadata });
    }
    revalidateDispute(parsed.data.disputeId);
    return { ok: true };
  } catch (err) {
    console.error("runAgentAction failed", err);
    return GENERIC;
  }
}

export async function resolveApprovalAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  // Unknown choices decode to null; the schema then rejects the undefined decision.
  const choice = decodeApprovalChoice(formData.get("choice"));
  const parsed = ResolveApprovalInputSchema.safeParse({
    disputeId: formData.get("disputeId"),
    approvalId: formData.get("approvalId"),
    decision: choice?.decision,
    resolvedAction: choice?.resolvedAction,
    note: formData.get("note"),
  });
  if (!parsed.success) return INVALID;
  const { disputeId, approvalId, decision, resolvedAction, note } = parsed.data;

  try {
    // Read the proposal from the database; the client only names the approval.
    const approval = await getApproval(approvalId);
    if (!approval || approval.disputeId !== disputeId) return INVALID;
    if (approval.status !== "pending") {
      revalidateDispute(disputeId);
      return ALREADY_DECIDED;
    }

    const check = resolveAgainstProposal(
      approval.proposedAction,
      decision === "approve" ? "approved" : "rejected",
      resolvedAction,
    );
    if (!check.ok) {
      const messages = {
        must_match_proposal: "Approving must use the proposed action. To choose differently, reject it.",
        action_required: "Choose defend or accept to approve an escalated case.",
        action_not_allowed: "A rejection cannot include a chosen action.",
      } as const;
      return { ok: false, message: messages[check.code] };
    }

    await resolveApprovalWorkflow({
      disputeId,
      approvalId,
      decision: decision === "approve" ? "approved" : "rejected",
      resolvedAction: check.resolvedAction,
      // DEMO_MERCHANT_ID is a stand-in until real auth; never take identity from the form.
      decidedBy: DEMO_MERCHANT_ID,
      note,
      now: new Date(),
      createId: () => crypto.randomUUID(),
    });
  } catch (err) {
    if (err instanceof ApprovalAlreadyResolvedError) {
      revalidateDispute(disputeId);
      return ALREADY_DECIDED;
    }
    if (err instanceof DisputeNotReadyError || err instanceof DisputeNotFoundError) {
      revalidateDispute(disputeId);
      return NOT_READY;
    }
    if (err instanceof ApprovalDisputeMismatchError) return INVALID;
    console.error("resolveApprovalAction failed", err);
    return GENERIC;
  }

  revalidateDispute(disputeId);
  return { ok: true };
}

export async function submitDefenseAction(disputeId: string): Promise<ActionState> {
  const parsed = SubmitDefenseInputSchema.safeParse({ disputeId });
  if (!parsed.success) return INVALID;

  try {
    await submitDefense(parsed.data.disputeId, {
      now: () => new Date(),
      createId: () => crypto.randomUUID(),
    });
  } catch (err) {
    // A failed attempt is logged on the dispute, so refresh the page in every case.
    revalidateDispute(parsed.data.disputeId);
    if (err instanceof DisputeNotFoundError) return { ok: false, message: "We could not find that dispute." };
    if (err instanceof SubmissionNotAllowedError) return NOT_READY;
    if (err instanceof ProviderSubmissionFailedError) {
      return { ok: false, message: "The payment provider did not accept the response. You can try again." };
    }
    console.error("submitDefenseAction failed", err);
    return GENERIC;
  }

  revalidateDispute(parsed.data.disputeId);
  return { ok: true };
}
