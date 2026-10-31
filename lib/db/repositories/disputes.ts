import { DisputeStatusSchema, type Dispute, type DisputeStatus } from "../../../contracts";
import { disputeFromRow, disputeToWriteData } from "../mappers";
import { prisma, runAtomic, type DbClient } from "../prisma";

const withEvidence = { evidence: { orderBy: { collectedAt: "asc" } } } as const;

export async function getDispute(
  id: string,
  db: DbClient = prisma,
): Promise<Dispute | null> {
  const row = await db.dispute.findUnique({
    where: { id },
    include: withEvidence,
  });
  return row ? disputeFromRow(row) : null;
}

export async function listDisputes(db: DbClient = prisma): Promise<Dispute[]> {
  const rows = await db.dispute.findMany({
    orderBy: { createdAt: "desc" },
    include: withEvidence,
  });
  return rows.map(disputeFromRow);
}

/** Disputes in one status, most urgent deadline first. One query. */
export async function listDisputesByStatus(
  status: DisputeStatus,
  db: DbClient = prisma,
): Promise<Dispute[]> {
  const rows = await db.dispute.findMany({
    where: { status: DisputeStatusSchema.parse(status) },
    orderBy: [{ deadline: "asc" }, { id: "asc" }],
    include: withEvidence,
  });
  return rows.map(disputeFromRow);
}

/** Throws if the dispute does not exist or the status is not a valid DisputeStatus. */
export async function updateDisputeStatus(
  id: string,
  status: DisputeStatus,
  db: DbClient = prisma,
): Promise<Dispute> {
  const row = await db.dispute.update({
    where: { id },
    data: { status: DisputeStatusSchema.parse(status) },
    include: withEvidence,
  });
  return disputeFromRow(row);
}

/**
 * Moves a dispute to `to` only if its current status is one of `from`. The
 * guard is in the UPDATE's WHERE, so concurrent callers cannot both pass it.
 * Returns false (nothing changed) when the dispute is missing or in another status.
 */
export async function transitionDisputeStatus(
  id: string,
  from: readonly DisputeStatus[],
  to: DisputeStatus,
  db: DbClient = prisma,
): Promise<boolean> {
  const { count } = await db.dispute.updateMany({
    where: { id, status: { in: from.map((s) => DisputeStatusSchema.parse(s)) } },
    data: { status: DisputeStatusSchema.parse(to) },
  });
  return count === 1;
}

/**
 * Writes a dispute and its evidence atomically (own transaction, or the
 * caller's if db is a transaction client). Upserts by id, so reruns are safe
 * (they overwrite the stored fields, including status). The dispute goes first
 * so the evidence foreign key is satisfied.
 */
export async function createDisputeWithEvidence(
  dispute: Dispute,
  db: DbClient = prisma,
): Promise<void> {
  const { id, fields, evidence } = disputeToWriteData(dispute);
  await runAtomic(db, async (tx) => {
    await tx.dispute.upsert({
      where: { id },
      create: { id, ...fields },
      update: fields,
    });
    for (const e of evidence) {
      await tx.evidence.upsert({
        where: { id: e.id },
        create: { id: e.id, ...e.fields },
        update: e.fields,
      });
    }
  });
}
