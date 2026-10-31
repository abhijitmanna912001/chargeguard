import type { SubmissionResult } from "../../../contracts";
import { IdempotencyKeyConflictError, SubmissionNotPendingError } from "../errors";
import { submissionFromRow, submissionToCreateData } from "../mappers";
import { prisma, runAtomic, type DbClient } from "../prisma";

/**
 * Idempotent on idempotencyKey, enforced by the unique constraint. An upsert
 * with an empty update is a single INSERT ... ON CONFLICT on Postgres (the
 * documented native-upsert conditions hold: one unique field in `where`, same
 * value in `create`, no nested writes), so there is no check-then-insert gap
 * and no P2002 to catch. If the key already exists the stored row is returned
 * untouched; if it belongs to a different dispute that is a caller bug.
 */
export async function createSubmission(
  sub: SubmissionResult,
  db: DbClient = prisma,
): Promise<SubmissionResult> {
  const data = submissionToCreateData(sub);
  const row = await db.submission.upsert({
    where: { idempotencyKey: data.idempotencyKey },
    create: data,
    update: {},
  });
  if (row.disputeId !== data.disputeId) {
    throw new IdempotencyKeyConflictError(data.idempotencyKey);
  }
  return submissionFromRow(row);
}

export async function getSubmissionByKey(
  key: string,
  db: DbClient = prisma,
): Promise<SubmissionResult | null> {
  const row = await db.submission.findUnique({
    where: { idempotencyKey: key },
  });
  return row ? submissionFromRow(row) : null;
}

// Both transitions only leave "pending", so a finished submission is never
// overwritten (e.g. a late failure cannot clobber a recorded success).
async function finalize(
  id: string,
  data: { status: string; submittedAt?: Date; providerRef?: string; errorMessage?: string },
  db: DbClient,
): Promise<SubmissionResult> {
  return runAtomic(db, async (tx) => {
    const { count } = await tx.submission.updateMany({
      where: { id, status: "pending" },
      data,
    });
    if (count === 0) throw new SubmissionNotPendingError(id);
    return submissionFromRow(await tx.submission.findUniqueOrThrow({ where: { id } }));
  });
}

export function markSubmitted(
  id: string,
  providerRef: string,
  db: DbClient = prisma,
): Promise<SubmissionResult> {
  return finalize(id, { status: "submitted", submittedAt: new Date(), providerRef }, db);
}

export function markFailed(
  id: string,
  errorMessage: string,
  db: DbClient = prisma,
): Promise<SubmissionResult> {
  return finalize(id, { status: "failed", errorMessage }, db);
}
