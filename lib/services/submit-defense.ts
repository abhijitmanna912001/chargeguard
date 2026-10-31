// Sends an approved defense to the (simulated) provider. A submitted response is
// NOT a won dispute; it only means the provider accepted the paperwork.
//
// Shape: read -> create/reopen the submission row -> call the provider with NO
// transaction open -> one short transaction to record the outcome.
import type { SubmissionResult } from "../../contracts";
import { SubmissionNotPendingError } from "../db/errors";
import { prisma } from "../db/prisma";
import { appendActionLog } from "../db/repositories/action-log";
import { getLatestApproval } from "../db/repositories/approvals";
import { getDispute, transitionDisputeStatus } from "../db/repositories/disputes";
import { getRecommendation } from "../db/repositories/recommendations";
import {
  createSubmission,
  getSubmissionByKey,
  markFailed,
  markSubmitted,
  reopenFailedSubmission,
} from "../db/repositories/submissions";
import {
  submitDefenseResponse,
  type ProviderResult,
  type SubmitDefenseInput,
} from "../integrations/paytm-client";
import { buildDefensePackage } from "./defense-package";
import { DisputeNotFoundError, ProviderSubmissionFailedError, SubmissionNotAllowedError } from "./errors";

export type SubmitDefenseDeps = {
  now: () => Date;
  createId: () => string;
  /** Defaults to the Paytm client. Tests pass a fake. */
  submitToProvider?: (input: SubmitDefenseInput) => Promise<ProviderResult>;
};

export type SubmitDefenseResult = { submission: SubmissionResult; alreadySubmitted: boolean };

/** Same dispute + same approval = same key, so every retry is the same provider request. */
export function defenseIdempotencyKey(disputeId: string, approvalId: string): string {
  return `defense:${disputeId}:${approvalId}`;
}

export async function submitDefense(disputeId: string, deps: SubmitDefenseDeps): Promise<SubmitDefenseResult> {
  const { now, createId, submitToProvider = submitDefenseResponse } = deps;

  const dispute = await getDispute(disputeId);
  if (!dispute) throw new DisputeNotFoundError(disputeId);

  const approval = await getLatestApproval(disputeId);

  // Replay first: once submitted the dispute is no longer "decided", so the
  // status check below would wrongly reject a repeat of a call that succeeded.
  if (approval) {
    const prior = await getSubmissionByKey(defenseIdempotencyKey(disputeId, approval.id));
    if (prior?.status === "submitted") return { submission: prior, alreadySubmitted: true };
  }

  if (dispute.status !== "decided") throw new SubmissionNotAllowedError(disputeId, "status_not_decided");
  if (!approval) throw new SubmissionNotAllowedError(disputeId, "no_approval");
  if (approval.status !== "approved") throw new SubmissionNotAllowedError(disputeId, "approval_not_approved");
  if (approval.resolvedAction !== "defend") throw new SubmissionNotAllowedError(disputeId, "action_not_defend");

  const recommendation = await getRecommendation(approval.recommendationId);
  if (!recommendation) throw new Error(`Recommendation ${approval.recommendationId} is missing`); // FK makes this a bug
  const defensePackage = buildDefensePackage(dispute, recommendation);

  const idempotencyKey = defenseIdempotencyKey(disputeId, approval.id);
  let submission = await createSubmission({ id: createId(), disputeId, idempotencyKey, status: "pending" });
  // A failed attempt is retried on the same row and key; the provider dedupes by key.
  if (submission.status === "failed") submission = (await reopenFailedSubmission(submission.id)) ?? submission;
  if (submission.status === "submitted") return { submission, alreadySubmitted: true };

  // Network call: deliberately outside any database transaction.
  let outcome: ProviderResult;
  try {
    outcome = await submitToProvider({ idempotencyKey, package: defensePackage });
  } catch {
    outcome = { ok: false, retryable: true, message: "The provider call failed unexpectedly." };
  }

  try {
    const recorded = await prisma.$transaction(async (tx) => {
      const timestamp = now().toISOString();
      if (outcome.ok) {
        const done = await markSubmitted(submission.id, outcome.providerRef, tx);
        const moved = await transitionDisputeStatus(disputeId, ["decided"], "submitted", tx);
        // Anomaly (a decided dispute cannot leave "decided" any other way): roll back.
        if (!moved) throw new SubmissionNotAllowedError(disputeId, "status_not_decided");
        await appendActionLog(
          {
            id: createId(),
            disputeId,
            timestamp,
            step: "submit",
            actor: "system",
            summary: `Defense response submitted to the simulated provider (ref ${outcome.providerRef})`,
            evidenceRefs: defensePackage.evidenceRefs,
            outcome: "submitted",
          },
          tx,
        );
        return done;
      }
      const failed = await markFailed(submission.id, outcome.message, tx);
      await appendActionLog(
        {
          id: createId(),
          disputeId,
          timestamp,
          step: "submit",
          actor: "system",
          summary: `Submission to the simulated provider failed: ${outcome.message}`,
          evidenceRefs: [],
          outcome: "failed",
        },
        tx,
      );
      return failed;
    });
    if (recorded.status === "submitted") return { submission: recorded, alreadySubmitted: false };
    throw new ProviderSubmissionFailedError(disputeId, outcome.ok ? true : outcome.retryable);
  } catch (err) {
    if (!(err instanceof SubmissionNotPendingError)) throw err;
    // A concurrent call finished this row first and our transaction rolled back.
    // If it succeeded, that is our answer; if it failed, report the failure.
    const existing = await getSubmissionByKey(idempotencyKey);
    if (existing?.status === "submitted") return { submission: existing, alreadySubmitted: true };
    throw new ProviderSubmissionFailedError(disputeId, true);
  }
}
