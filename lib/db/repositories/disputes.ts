import { DisputeStatusSchema, type Dispute, type DisputeStatus } from "../../../contracts";
import { disputeFromRow, disputeToWriteData } from "../mappers";
import { prisma } from "../prisma";

const withEvidence = { evidence: { orderBy: { collectedAt: "asc" } } } as const;

export async function getDispute(id: string): Promise<Dispute | null> {
  const row = await prisma.dispute.findUnique({
    where: { id },
    include: withEvidence,
  });
  return row ? disputeFromRow(row) : null;
}

export async function listDisputes(): Promise<Dispute[]> {
  const rows = await prisma.dispute.findMany({
    orderBy: { createdAt: "desc" },
    include: withEvidence,
  });
  return rows.map(disputeFromRow);
}

/** Throws if the dispute does not exist or the status is not a valid DisputeStatus. */
export async function updateDisputeStatus(
  id: string,
  status: DisputeStatus,
): Promise<Dispute> {
  const row = await prisma.dispute.update({
    where: { id },
    data: { status: DisputeStatusSchema.parse(status) },
    include: withEvidence,
  });
  return disputeFromRow(row);
}

/**
 * Writes a dispute and its evidence in one transaction. Upserts by id, so
 * reruns are safe (they overwrite the stored fields, including status).
 * The dispute goes first so the evidence foreign key is satisfied.
 */
export async function createDisputeWithEvidence(dispute: Dispute): Promise<void> {
  const { id, fields, evidence } = disputeToWriteData(dispute);
  await prisma.$transaction([
    prisma.dispute.upsert({
      where: { id },
      create: { id, ...fields },
      update: fields,
    }),
    ...evidence.map((e) =>
      prisma.evidence.upsert({
        where: { id: e.id },
        create: { id: e.id, ...e.fields },
        update: e.fields,
      }),
    ),
  ]);
}
