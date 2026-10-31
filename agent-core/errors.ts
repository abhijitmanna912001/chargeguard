import type { ValidationIssue } from "./model/errors";

/**
 * The dispute passed to runAgent failed DisputeSchema: a caller bug, not a
 * dispute outcome. Issues carry paths and Zod messages only, never the
 * rejected values, so customer content cannot leak through the error.
 */
export class InvalidDisputeError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Dispute failed validation (${issues.length} issue(s))`);
    this.name = "InvalidDisputeError";
    this.issues = issues;
  }
}
