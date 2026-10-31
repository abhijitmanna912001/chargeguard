import type { ApprovalRequest } from "../../../contracts";
import { ApprovalAlreadyResolvedError } from "../errors";
import {
  approvalFromRow,
  approvalResolutionToUpdateData,
  approvalToCreateData,
  type ApprovalResolution,
} from "../mappers";
import { prisma, runAtomic, type DbClient } from "../prisma";

export async function createApprovalRequest(
  req: ApprovalRequest,
  db: DbClient = prisma,
): Promise<ApprovalRequest> {
  const row = await db.approvalRequest.create({
    data: approvalToCreateData(req),
  });
  return approvalFromRow(row);
}

export async function getApproval(
  id: string,
  db: DbClient = prisma,
): Promise<ApprovalRequest | null> {
  const row = await db.approvalRequest.findUnique({ where: { id } });
  return row ? approvalFromRow(row) : null;
}

export async function getPendingApproval(
  disputeId: string,
  db: DbClient = prisma,
): Promise<ApprovalRequest | null> {
  const row = await db.approvalRequest.findFirst({
    where: { disputeId, status: "pending" },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
  });
  return row ? approvalFromRow(row) : null;
}

/**
 * Resolves a pending approval exactly once. The status guard lives in the
 * UPDATE's WHERE, so two concurrent deciders cannot both win; the loser gets
 * ApprovalAlreadyResolvedError. The read-back is validated inside the same
 * transaction, so a row that breaks the contract rolls the update back.
 */
export async function resolveApproval(
  id: string,
  resolution: ApprovalResolution,
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<ApprovalRequest> {
  const data = approvalResolutionToUpdateData(resolution, now);
  return runAtomic(db, async (tx) => {
    const { count } = await tx.approvalRequest.updateMany({
      where: { id, status: "pending" },
      data,
    });
    if (count === 0) throw new ApprovalAlreadyResolvedError(id);
    const row = await tx.approvalRequest.findUniqueOrThrow({ where: { id } });
    return approvalFromRow(row);
  });
}
