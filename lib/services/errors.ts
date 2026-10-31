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
