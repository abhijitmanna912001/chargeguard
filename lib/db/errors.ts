export class ApprovalAlreadyResolvedError extends Error {
  constructor(readonly approvalId: string) {
    super(`Approval ${approvalId} is already resolved or does not exist`);
    this.name = "ApprovalAlreadyResolvedError";
  }
}

/** Same idempotency key reused for a different dispute: a caller bug, never merge silently. */
export class IdempotencyKeyConflictError extends Error {
  constructor(readonly idempotencyKey: string) {
    super(`Idempotency key ${idempotencyKey} already belongs to another dispute`);
    this.name = "IdempotencyKeyConflictError";
  }
}

/** Submission is no longer pending (already submitted or failed) or does not exist. */
export class SubmissionNotPendingError extends Error {
  constructor(readonly submissionId: string) {
    super(`Submission ${submissionId} is not pending or does not exist`);
    this.name = "SubmissionNotPendingError";
  }
}
