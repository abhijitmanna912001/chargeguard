export class DisputeNotFoundError extends Error {
  constructor(readonly disputeId: string) {
    super(`Dispute ${disputeId} does not exist`);
    this.name = "DisputeNotFoundError";
  }
}

/** The dispute is not in a status where an agent run may be saved (received or gathering). */
export class DisputeNotReadyError extends Error {
  constructor(
    readonly disputeId: string,
    readonly status: string,
  ) {
    super(`Dispute ${disputeId} is "${status}"; an agent run can only be saved from received or gathering`);
    this.name = "DisputeNotReadyError";
  }
}

/** A recommendation or log entry in the run belongs to a different dispute. */
export class AgentRunMismatchError extends Error {
  constructor(
    readonly disputeId: string,
    readonly offendingId: string,
  ) {
    super(`Agent run item ${offendingId} does not belong to dispute ${disputeId}`);
    this.name = "AgentRunMismatchError";
  }
}

/** The approval exists but belongs to a different dispute than the one named. */
export class ApprovalDisputeMismatchError extends Error {
  constructor(
    readonly approvalId: string,
    readonly disputeId: string,
  ) {
    super(`Approval ${approvalId} does not belong to dispute ${disputeId}`);
    this.name = "ApprovalDisputeMismatchError";
  }
}

/** A human decision that breaks the decision rules (checked before touching the database). */
export class InvalidDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDecisionError";
  }
}

export type SubmissionBlockedReason = "status_not_decided" | "no_approval" | "approval_not_approved" | "action_not_defend";

/** The dispute is not in a state where a defense may be submitted. No provider call was made. */
export class SubmissionNotAllowedError extends Error {
  constructor(
    readonly disputeId: string,
    readonly reason: SubmissionBlockedReason,
  ) {
    super(`Dispute ${disputeId} cannot be submitted: ${reason}`);
    this.name = "SubmissionNotAllowedError";
  }
}

/** The provider did not accept the response. The failure is recorded; the dispute stays "decided". */
export class ProviderSubmissionFailedError extends Error {
  constructor(
    readonly disputeId: string,
    readonly retryable: boolean,
  ) {
    super(`The provider did not accept the response for dispute ${disputeId}`);
    this.name = "ProviderSubmissionFailedError";
  }
}
