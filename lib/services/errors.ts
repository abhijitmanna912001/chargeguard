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
