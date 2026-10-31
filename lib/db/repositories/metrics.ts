// Read-only aggregate queries for the /metrics page. One query per function,
// so the page never loops over disputes (no N+1).
import { ApprovalStatusSchema, DisputeStatusSchema, ResolvedActionSchema } from "../../../contracts";
import type { ApprovalStatus, DisputeStatus, ResolvedAction } from "../../../contracts";
import { prisma, type DbClient } from "../prisma";

export type StatusCount = { status: DisputeStatus; count: number };
export type ApprovalCount = { status: ApprovalStatus; resolvedAction: ResolvedAction | null; count: number };

/** Disputes grouped by status. Statuses with no disputes are absent. */
export async function countDisputesByStatus(db: DbClient = prisma): Promise<StatusCount[]> {
  const rows = await db.dispute.groupBy({ by: ["status"], _count: { _all: true } });
  return rows.map((r) => ({ status: DisputeStatusSchema.parse(r.status), count: r._count._all }));
}

/** Approval requests grouped by status and the human's chosen action. */
export async function countApprovalsByOutcome(db: DbClient = prisma): Promise<ApprovalCount[]> {
  const rows = await db.approvalRequest.groupBy({
    by: ["status", "resolvedAction"],
    _count: { _all: true },
  });
  return rows.map((r) => ({
    status: ApprovalStatusSchema.parse(r.status),
    resolvedAction: r.resolvedAction === null ? null : ResolvedActionSchema.parse(r.resolvedAction),
    count: r._count._all,
  }));
}

/**
 * Seconds from each dispute's first action-log entry to its first human
 * "approve" entry (approved or rejected), one number per decided dispute.
 * Prisma's groupBy cannot take a conditional MIN, so this is one raw query.
 * The subtraction happens in Postgres and is cast to float8, so the driver
 * returns a plain JS number rather than a Date or Decimal.
 */
export async function listSecondsToDecision(db: DbClient = prisma): Promise<number[]> {
  const rows = await db.$queryRaw<{ seconds: number }[]>`
    SELECT EXTRACT(EPOCH FROM (
             MIN("timestamp") FILTER (WHERE "step" = 'approve' AND "actor" = 'human') - MIN("timestamp")
           ))::float8 AS "seconds"
    FROM "ActionLog"
    GROUP BY "disputeId"
    HAVING bool_or("step" = 'approve' AND "actor" = 'human')`;
  return rows.map((r) => Number(r.seconds));
}
