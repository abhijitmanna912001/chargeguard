import type { DeliveryStatus, DisputeSchema, Evidence, Flag, Id, Paise } from "../../contracts";
import type { z } from "zod";
import type { ValidationIssue } from "../model/errors";

export type EvidenceType = Evidence["type"];
export type EvidenceOf<T extends EvidenceType> = Extract<Evidence, { type: T }>;

/** Dispute fields without evidence; evidence is validated record by record. */
export type DisputeMetadata = Omit<z.infer<typeof DisputeSchema>, "evidence">;

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

/**
 * One required evidence type. Requirements test presence, not whether the
 * record helps the merchant: an in-transit delivery or a failed refund is
 * still evidence, and the decision layer interprets it.
 */
export type EvidenceRequirement = {
  [T in EvidenceType]: {
    type: T;
    /** Shown in issues and summaries, e.g. "delivery_proof with status delivered". */
    description: string;
    /**
     * Narrows which kind of record counts (e.g. a service log rather than a
     * courier scan). Must not test outcomes such as delivery status. Defaults
     * to any trusted record of this type.
     */
    satisfiedBy?: (record: EvidenceOf<T>) => boolean;
  };
}[EvidenceType];

export type EvidencePolicy = {
  description: string;
  requirements: readonly EvidenceRequirement[];
};

/** Keyed by exact reason code. */
export type EvidencePolicyRegistry = Readonly<Record<string, EvidencePolicy>>;

export type AssessOptions = {
  policies?: EvidencePolicyRegistry;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** A record that failed EvidenceSchema. Never carries the raw record. */
export type InvalidEvidence = {
  index: number;
  /** Only when the raw id is a short, plain identifier. */
  id?: string;
  /** Only when the raw type is a known evidence type. */
  type?: EvidenceType;
  issues: ValidationIssue[];
};

/** A schema-valid record that was not trusted. Id and type only, never content. */
export type ExcludedEvidence = {
  id: Id;
  type: EvidenceType;
  reason: "foreign_dispute" | "conflicting_duplicate_id" | "transaction_id_mismatch";
};

export type EvidenceIssueCode =
  | "evidence_array_missing"
  | "evidence_array_invalid"
  | "invalid_record"
  | "foreign_dispute"
  | "duplicate_record"
  | "conflicting_duplicate_id"
  | "transaction_id_mismatch"
  | "transaction_amount_mismatch"
  | "transaction_conflict"
  | "transaction_progression"
  | "transaction_occurred_at_differs"
  | "duplicate_transaction_record"
  | "transaction_not_successful"
  | "delivery_progression"
  | "delivery_in_transit"
  | "delivery_returned_to_origin"
  | "delivery_failed"
  | "delivery_status_unknown"
  | "delivery_conflict"
  | "settlement_pending"
  | "settlement_failed"
  | "settlement_timestamp_unexpected"
  | "settlement_conflict"
  | "duplicate_settlement_record"
  | "refund_issued"
  | "refund_pending"
  | "refund_failed"
  | "possible_duplicate_refund"
  | "refund_exceeds_amount"
  | "refund_excess_ambiguous"
  | "unsupported_reason_code"
  | "missing_required_evidence";

/**
 * A finding for the audit trail and UI. Severity is for display only; whether
 * a flag blocks an action is decided by the decision engine, not here.
 */
export type EvidenceIssue = {
  code: EvidenceIssueCode;
  severity: "info" | "warning" | "error";
  /** Built from templates: ids, enum values and amounts only, never free text. */
  message: string;
  /** May include untrusted record ids, so the UI can point at them. */
  evidenceRefs: Id[];
  /** Index into the input array, for records without a usable id. */
  index?: number;
  flag?: Flag;
};

export type RequirementResult = {
  type: EvidenceType;
  description: string;
  satisfied: boolean;
  /** Trusted records that satisfy the requirement. */
  evidenceRefs: Id[];
};

export type EvidenceCompleteness = {
  /** The reason code whose policy applied; null when the code is unsupported. */
  policy: string | null;
  /** All requirements met. Always false when the policy is unknown. Says nothing about the outcome. */
  complete: boolean;
  requiredCount: number;
  satisfiedCount: number;
  requirements: RequirementResult[];
};

/**
 * Refunds carry no refund id, so totals are over evidence records, not
 * confirmed refunds. Records that look alike are counted, never merged.
 */
export type RefundSummary = {
  /** Sum of every trusted issued refund record. */
  issuedTotal: Paise;
  /** issuedTotal if each group of possible duplicates were one refund. */
  issuedTotalIfDuplicatesMerged: Paise;
  /** Issued records sharing amount and issuedAt with another issued record. */
  possibleDuplicateRefs: Id[];
  pendingTotal: Paise;
  issuedCount: number;
  pendingCount: number;
  failedCount: number;
  /** issuedTotal (every record counted) against the disputed amount. */
  coverage: "none" | "partial" | "full" | "exceeds";
  /**
   * Whether issued refunds exceed the disputed amount:
   * - confirmed: they exceed even with possible duplicates merged;
   * - ambiguous: they exceed only if look-alike records are separate refunds;
   * - none: they do not exceed.
   */
  excess: "none" | "ambiguous" | "confirmed";
};

/** What the delivery records say; whether that supports a defence is not decided here. */
export type DeliverySummary = {
  /** Distinct statuses among trusted delivery records, in contract order. */
  statuses: DeliveryStatus[];
  /** Trusted delivery records with status delivered. */
  deliveredRefs: Id[];
};

export type EvidenceAssessment = {
  ok: true;
  disputeId: Id;
  dispute: DisputeMetadata;
  /**
   * Schema-valid records owned by this dispute, including ones later excluded
   * for an id conflict or another transaction. Never holds another dispute's
   * records. Send trustedEvidence, not this, to the model.
   */
  parsedEvidence: Evidence[];
  /** Records owned by this dispute, unambiguous and about the disputed transaction. */
  trustedEvidence: Evidence[];
  invalidEvidence: InvalidEvidence[];
  /** Why each schema-valid record was not trusted. The only trace of foreign records. */
  excludedEvidence: ExcludedEvidence[];
  /** Unique ids of trustedEvidence, in input order. */
  evidenceRefs: Id[];
  presentEvidenceTypes: EvidenceType[];
  missingEvidenceTypes: EvidenceType[];
  evidenceCompleteness: EvidenceCompleteness;
  delivery: DeliverySummary;
  refunds: RefundSummary;
  /** Evidence flags only, deduplicated, in FlagSchema order. */
  flags: Flag[];
  issues: EvidenceIssue[];
  summary: string;
};

export type InvalidDispute = {
  ok: false;
  error: {
    kind: "invalid_dispute";
    message: string;
    issues: ValidationIssue[];
  };
};

export type EvidenceAssessmentResult = EvidenceAssessment | InvalidDispute;
