// Pure row <-> contract mappers. No Prisma calls. The Zod contracts are the
// single source of truth, so every mapper parses its result rather than casting.
import { z } from "zod";
import {
  ActionLogEntrySchema,
  DisputeSchema,
  type ActionLogEntry,
  type Dispute,
  type Evidence,
} from "../../contracts";
import type {
  ActionLog as ActionLogRow,
  Dispute as DisputeRow,
  Evidence as EvidenceRow,
  Prisma,
} from "./generated/prisma/client";

export type DisputeRowWithEvidence = DisputeRow & { evidence: EvidenceRow[] };

const PayloadSchema = z.record(z.string(), z.unknown());

// Evidence is stored as columns (id, disputeId, type, collectedAt) plus a Json
// payload of the variant-specific fields. Columns win over anything in payload.
function evidenceFromRow(row: EvidenceRow): Record<string, unknown> {
  return {
    ...PayloadSchema.parse(row.payload),
    id: row.id,
    disputeId: row.disputeId,
    type: row.type,
    collectedAt: row.collectedAt.toISOString(),
  };
}

export function disputeFromRow(row: DisputeRowWithEvidence): Dispute {
  return DisputeSchema.parse({
    id: row.id,
    transactionId: row.transactionId,
    amount: row.amount,
    reasonCode: row.reasonCode,
    deadline: row.deadline.toISOString(),
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    evidence: row.evidence.map(evidenceFromRow),
  });
}

export function actionLogFromRow(row: ActionLogRow): ActionLogEntry {
  return ActionLogEntrySchema.parse({
    id: row.id,
    disputeId: row.disputeId,
    timestamp: row.timestamp.toISOString(),
    step: row.step,
    actor: row.actor,
    summary: row.summary,
    evidenceRefs: row.evidenceRefs,
    confidence: row.confidence ?? undefined,
    ruleId: row.ruleId ?? undefined,
    outcome: row.outcome,
  });
}

export function actionLogToCreateData(
  entry: ActionLogEntry,
): Prisma.ActionLogUncheckedCreateInput {
  const valid = ActionLogEntrySchema.parse(entry);
  return {
    ...valid,
    timestamp: new Date(valid.timestamp),
  };
}

export type EvidenceWriteData = {
  id: string;
  fields: {
    disputeId: string;
    type: string;
    collectedAt: Date;
    payload: Prisma.InputJsonObject;
  };
};

export type DisputeWriteData = {
  id: string;
  fields: Omit<DisputeRow, "id">;
  evidence: EvidenceWriteData[];
};

// Inverse of evidenceFromRow: everything except the columns goes into payload.
function evidenceToWriteData(evidence: Evidence): EvidenceWriteData {
  const { id, disputeId, type, collectedAt, ...payload } = evidence;
  return {
    id,
    fields: { disputeId, type, collectedAt: new Date(collectedAt), payload },
  };
}

export function disputeToWriteData(input: Dispute): DisputeWriteData {
  const { id, evidence, deadline, createdAt, ...rest } = DisputeSchema.parse(input);
  const foreign = evidence.find((e) => e.disputeId !== id);
  if (foreign) {
    throw new Error(`Evidence ${foreign.id} belongs to dispute ${foreign.disputeId}, not ${id}`);
  }
  return {
    id,
    fields: { ...rest, deadline: new Date(deadline), createdAt: new Date(createdAt) },
    evidence: evidence.map(evidenceToWriteData),
  };
}
