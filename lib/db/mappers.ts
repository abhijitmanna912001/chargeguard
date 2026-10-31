// Pure row <-> contract mappers. No Prisma calls. The Zod contracts are the
// single source of truth, so every mapper parses its result rather than casting.
import { z } from "zod";
import {
  ActionLogEntrySchema,
  DisputeSchema,
  type ActionLogEntry,
  type Dispute,
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
