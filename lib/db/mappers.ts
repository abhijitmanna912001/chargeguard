// Pure row <-> contract mappers. No Prisma calls. The Zod contracts are the
// single source of truth, so every mapper parses its result rather than casting.
import { z } from "zod";
import {
  ActionLogEntrySchema,
  ApprovalRequestSchema,
  DisputeSchema,
  IdSchema,
  ModelOutputSchema,
  RecommendationSchema,
  ResolvedActionSchema,
  SubmissionResultSchema,
  type ActionLogEntry,
  type ApprovalRequest,
  type Dispute,
  type Evidence,
  type Recommendation,
  type ResolvedAction,
  type SubmissionResult,
} from "../../contracts";
import {
  Prisma,
  type ActionLog as ActionLogRow,
  type ApprovalRequest as ApprovalRequestRow,
  type Dispute as DisputeRow,
  type Evidence as EvidenceRow,
  type Recommendation as RecommendationRow,
  type Submission as SubmissionRow,
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

// ---- Recommendation ----

export function recommendationFromRow(row: RecommendationRow): Recommendation {
  return RecommendationSchema.parse({
    id: row.id,
    disputeId: row.disputeId,
    createdAt: row.createdAt.toISOString(),
    // Column is Json?: SQL NULL reads back as null, which means the model failed.
    modelOutput: row.modelOutput === null ? null : ModelOutputSchema.parse(row.modelOutput),
    finalAction: row.finalAction,
    overrideReason: row.overrideReason ?? undefined,
    flags: row.flags,
  });
}

/** Validates first, so the superRefine rules are enforced before any insert. */
export function recommendationToCreateData(
  rec: Recommendation,
): Prisma.RecommendationUncheckedCreateInput {
  const valid = RecommendationSchema.parse(rec);
  return {
    ...valid,
    createdAt: new Date(valid.createdAt),
    // A plain null is not accepted for Json? on write; it must be DbNull.
    modelOutput: valid.modelOutput ?? Prisma.DbNull,
  };
}

// ---- ApprovalRequest ----

export function approvalFromRow(row: ApprovalRequestRow): ApprovalRequest {
  return ApprovalRequestSchema.parse({
    id: row.id,
    disputeId: row.disputeId,
    recommendationId: row.recommendationId,
    requestedAt: row.requestedAt.toISOString(),
    flags: row.flags,
    proposedAction: row.proposedAction,
    status: row.status,
    resolvedAction: row.resolvedAction ?? undefined,
    decidedBy: row.decidedBy ?? undefined,
    decidedAt: row.decidedAt?.toISOString(),
    note: row.note ?? undefined,
  });
}

export function approvalToCreateData(
  req: ApprovalRequest,
): Prisma.ApprovalRequestUncheckedCreateInput {
  const valid = ApprovalRequestSchema.parse(req);
  return {
    ...valid,
    requestedAt: new Date(valid.requestedAt),
    decidedAt: valid.decidedAt ? new Date(valid.decidedAt) : undefined,
  };
}

const ApprovalResolutionSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    resolvedAction: ResolvedActionSchema.optional(),
    decidedBy: IdSchema,
    note: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === "approved" && !val.resolvedAction) {
      ctx.addIssue({
        code: "custom",
        path: ["resolvedAction"],
        message: "resolvedAction is required when approving",
      });
    }
    if (val.status === "rejected" && val.resolvedAction) {
      ctx.addIssue({
        code: "custom",
        path: ["resolvedAction"],
        message: "resolvedAction must be absent when rejecting",
      });
    }
  });

export type ApprovalResolution = {
  status: "approved" | "rejected";
  resolvedAction?: ResolvedAction;
  decidedBy: string;
  note?: string;
};

/** Pure: validates a human decision and builds the row update. `now` is injected for tests. */
export function approvalResolutionToUpdateData(
  input: ApprovalResolution,
  now: Date,
): Prisma.ApprovalRequestUncheckedUpdateManyInput {
  const valid = ApprovalResolutionSchema.parse(input);
  return {
    status: valid.status,
    resolvedAction: valid.resolvedAction,
    decidedBy: valid.decidedBy,
    decidedAt: now,
    note: valid.note,
  };
}

// ---- Submission ----

export function submissionFromRow(row: SubmissionRow): SubmissionResult {
  return SubmissionResultSchema.parse({
    id: row.id,
    disputeId: row.disputeId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    submittedAt: row.submittedAt?.toISOString(),
    providerRef: row.providerRef ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
  });
}

export function submissionToCreateData(
  sub: SubmissionResult,
): Prisma.SubmissionUncheckedCreateInput {
  const valid = SubmissionResultSchema.parse(sub);
  return {
    ...valid,
    submittedAt: valid.submittedAt ? new Date(valid.submittedAt) : undefined,
  };
}
