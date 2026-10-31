import "server-only";
import { DeliveryStatusSchema, FlagSchema, type Evidence, type Id } from "../../contracts";
import { DEFAULT_EVIDENCE_POLICIES, findPolicy } from "./policies";
import type {
  AssessOptions,
  DeliverySummary,
  DisputeMetadata,
  EvidenceAssessment,
  EvidenceAssessmentResult,
  EvidenceCompleteness,
  EvidenceIssue,
  EvidenceIssueCode,
  EvidenceOf,
  EvidencePolicyRegistry,
  EvidenceType,
  ExcludedEvidence,
  InvalidEvidence,
  RefundSummary,
  RequirementResult,
} from "./types";
import { canonical, EVIDENCE_TYPES, parseDispute, parseRecords, selectTrusted } from "./validate";

// Evidence assessment: what the supplied records show, what is missing and
// what conflicts. It never picks defend, accept or escalate, never scores
// confidence and never reads the clock; deadlines and limits live elsewhere.

/**
 * Assesses the evidence already attached to a dispute record. It does not
 * fetch documents from merchant or payment systems.
 */
export function assessEvidence(input: unknown, options: AssessOptions = {}): EvidenceAssessmentResult {
  const head = parseDispute(input);
  if (!head.ok) {
    return {
      ok: false,
      error: { kind: "invalid_dispute", message: "Dispute metadata failed validation", issues: head.issues },
    };
  }
  const { dispute } = head;
  const records = parseRecords(head.rawEvidence);
  const selected = selectTrusted(dispute, records.parsed);
  const trusted = selected.trusted;
  const refundCheck = checkRefunds(dispute, ofType(trusted, "refund"));
  const completeness = checkCompleteness(
    dispute,
    trusted,
    selected.excluded,
    records.invalid,
    options.policies ?? DEFAULT_EVIDENCE_POLICIES,
  );

  const issues = [
    ...head.issues,
    ...records.issues,
    ...selected.issues,
    ...checkTransactions(dispute, ofType(trusted, "transaction")),
    ...checkDelivery(ofType(trusted, "delivery_proof")),
    ...checkSettlements(ofType(trusted, "settlement")),
    ...refundCheck.issues,
    ...completeness.issues,
  ];
  const flags = FlagSchema.options.filter((flag) => issues.some((issue) => issue.flag === flag));

  const assessment: Omit<EvidenceAssessment, "summary"> = {
    ok: true,
    disputeId: dispute.id,
    dispute,
    parsedEvidence: selected.owned,
    trustedEvidence: trusted,
    invalidEvidence: records.invalid,
    excludedEvidence: selected.excluded,
    evidenceRefs: unique(trusted.map((record) => record.id)),
    presentEvidenceTypes: EVIDENCE_TYPES.filter((type) => trusted.some((record) => record.type === type)),
    missingEvidenceTypes: unique(
      completeness.result.requirements.filter((req) => !req.satisfied).map((req) => req.type),
    ),
    evidenceCompleteness: completeness.result,
    delivery: summarizeDelivery(ofType(trusted, "delivery_proof")),
    refunds: refundCheck.summary,
    flags,
    issues,
  };
  return { ...assessment, summary: summarize(assessment, selected.excluded.length) };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

function checkTransactions(dispute: DisputeMetadata, txns: EvidenceOf<"transaction">[]): EvidenceIssue[] {
  const issues: EvidenceIssue[] = [];
  if (txns.length === 0) return issues;

  for (const txn of txns) {
    if (txn.amount !== dispute.amount) {
      issues.push({
        code: "transaction_amount_mismatch",
        severity: "error",
        message: `Transaction evidence ${txn.id} shows ${txn.amount} paise; the dispute is for ${dispute.amount} paise`,
        evidenceRefs: [txn.id],
        flag: "contradictory_records",
      });
    }
  }

  const conflict = transactionConflict(txns);
  if (conflict) {
    issues.push({
      code: "transaction_conflict",
      severity: "error",
      message: `Transaction records cannot be reconciled (${conflict}): ${describeEach(txns, (t) => `${t.status} ${t.amount} paise`)}`,
      evidenceRefs: ids(txns),
      flag: "contradictory_records",
    });
  } else if (txns.some((t) => t.status === "pending") && txns.some((t) => t.status !== "pending")) {
    issues.push({
      code: "transaction_progression",
      severity: "info",
      message: "Every pending snapshot was collected before the final status, consistent with normal progression",
      evidenceRefs: ids(txns),
    });
  }

  // occurredAt has no documented meaning, so a difference is shown but never
  // flagged and never changes the consistency result above.
  if (new Set(txns.map((t) => instant(t.occurredAt))).size > 1) {
    issues.push({
      code: "transaction_occurred_at_differs",
      severity: "warning",
      message:
        "Transaction records give different occurredAt times; the contract does not define the field, so this is shown for review only",
      evidenceRefs: ids(txns),
    });
  }

  const groups = groupBy(txns, (txn) => canonical({ a: txn.amount, s: txn.status, t: instant(txn.occurredAt) }));
  for (const group of groups.values()) {
    if (group.length > 1) {
      issues.push({
        code: "duplicate_transaction_record",
        severity: "info",
        message: `Transaction records ${ids(group).join(", ")} describe the same transaction state`,
        evidenceRefs: ids(group),
      });
    }
  }

  if (!txns.some((txn) => txn.status === "success")) {
    issues.push({
      code: "transaction_not_successful",
      severity: "warning",
      message: `No transaction record shows success: ${describeEach(txns, (t) => t.status)}`,
      evidenceRefs: ids(txns),
      flag: "transaction_not_successful",
    });
  }
  return issues;
}

/**
 * Why the records cannot describe one transaction, or undefined if they can.
 *
 * Ordering comes only from collectedAt, the time each snapshot was taken.
 * occurredAt is undocumented beyond one time per record, so it plays no part
 * here: differing values are reported as a flagless warning elsewhere.
 *
 * Pending then success (or failed) is progression only when every pending
 * snapshot was collected strictly before every final one. Anything else (a
 * pending snapshot taken at the same instant or after a final one) leaves
 * the order unknown and is reported as a conflict for review.
 */
function transactionConflict(txns: EvidenceOf<"transaction">[]): string | undefined {
  if (new Set(txns.map((t) => t.amount)).size > 1) return "amounts differ";
  const final = txns.filter((t) => t.status !== "pending");
  if (new Set(final.map((t) => t.status)).size > 1) return "both success and failed";
  const ordered = txns
    .filter((t) => t.status === "pending")
    .every((p) => final.every((f) => instant(p.collectedAt) < instant(f.collectedAt)));
  return ordered ? undefined : "a pending snapshot was not collected strictly before the final status";
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

function summarizeDelivery(proofs: EvidenceOf<"delivery_proof">[]): DeliverySummary {
  return {
    statuses: DeliveryStatusSchema.options.filter((status) => proofs.some((proof) => proof.status === status)),
    deliveredRefs: ids(proofs.filter((proof) => proof.status === "delivered")),
  };
}

const TERMINAL_DELIVERY = ["delivered", "returned_to_origin", "failed"] as const;

const DELIVERY_STATUS_ISSUES: Record<
  Exclude<EvidenceOf<"delivery_proof">["status"], "delivered">,
  { code: EvidenceIssueCode; text: string }
> = {
  in_transit: { code: "delivery_in_transit", text: "shows the order still in transit" },
  returned_to_origin: { code: "delivery_returned_to_origin", text: "shows the order returned to origin" },
  failed: { code: "delivery_failed", text: "shows a failed delivery" },
  unknown: { code: "delivery_status_unknown", text: "has an unknown delivery status" },
};

/**
 * The contract has no structured shipment id (`reference` is free text that
 * may be a tracking number, receipt or log id), so records cannot be tied to
 * separate shipment attempts. Distinct terminal outcomes are therefore treated
 * as a conflict rather than explained away.
 */
function checkDelivery(proofs: EvidenceOf<"delivery_proof">[]): EvidenceIssue[] {
  const issues: EvidenceIssue[] = [];
  if (proofs.length === 0) return issues;

  for (const [status, { code, text }] of Object.entries(DELIVERY_STATUS_ISSUES)) {
    const matching = proofs.filter((proof) => proof.status === status);
    if (matching.length === 0) continue;
    issues.push({
      code,
      severity: "warning",
      message: `Delivery proof ${ids(matching).join(", ")} ${text}; it does not confirm delivery`,
      evidenceRefs: ids(matching),
    });
  }

  const terminal = TERMINAL_DELIVERY.filter((status) => proofs.some((proof) => proof.status === status));
  const relevant = proofs.filter((proof) => (TERMINAL_DELIVERY as readonly string[]).includes(proof.status));
  if (terminal.length > 1) {
    issues.push({
      code: "delivery_conflict",
      severity: "error",
      message: `Delivery records show conflicting outcomes (${terminal.join(", ")}) and cannot be reconciled without a shipment id`,
      evidenceRefs: ids(relevant),
      flag: "contradictory_records",
    });
  } else if (terminal[0] === "delivered" && proofs.some((proof) => proof.status === "in_transit")) {
    issues.push({
      code: "delivery_progression",
      severity: "info",
      message: "Delivery records show in transit and delivered, consistent with normal progression",
      evidenceRefs: ids(proofs.filter((proof) => proof.status === "in_transit" || proof.status === "delivered")),
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/**
 * Settlement amounts are never compared with the transaction: batching and
 * fees make them differ legitimately, and the contract does not link a
 * settlement to a transaction id.
 */
function checkSettlements(settlements: EvidenceOf<"settlement">[]): EvidenceIssue[] {
  const issues: EvidenceIssue[] = [];

  for (const s of settlements) {
    if (s.status === "pending") {
      issues.push({
        code: "settlement_pending",
        severity: "info",
        message: `Settlement ${s.settlementId} (evidence ${s.id}) is still pending`,
        evidenceRefs: [s.id],
      });
    } else if (s.status === "failed") {
      issues.push({
        code: "settlement_failed",
        severity: "warning",
        message: `Settlement ${s.settlementId} (evidence ${s.id}) failed`,
        evidenceRefs: [s.id],
      });
    }
    if (s.status !== "settled" && s.settledAt !== undefined) {
      issues.push({
        code: "settlement_timestamp_unexpected",
        severity: "warning",
        message: `Settlement evidence ${s.id} has a settledAt time but status ${s.status}`,
        evidenceRefs: [s.id],
      });
    }
  }

  for (const [settlementId, group] of groupBy(settlements, (s) => s.settlementId)) {
    if (group.length < 2) continue;
    const variants = new Set(group.map((s) => canonical({ a: s.amount, s: s.status, t: s.settledAt ?? null })));
    issues.push(
      variants.size > 1
        ? {
            code: "settlement_conflict",
            severity: "error",
            message: `Settlement ${settlementId} has records that disagree: ${describeEach(group, (s) => `${s.status} ${s.amount} paise`)}`,
            evidenceRefs: ids(group),
            flag: "contradictory_records",
          }
        : {
            code: "duplicate_settlement_record",
            severity: "info",
            message: `Settlement ${settlementId} is recorded ${group.length} times with the same details`,
            evidenceRefs: ids(group),
          },
    );
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/**
 * Refunds carry no refund id, so two issued records with the same amount and
 * time may be one refund recorded twice or two real refunds. Both are
 * counted, and the merged total is reported alongside so nothing is guessed.
 */
function checkRefunds(
  dispute: DisputeMetadata,
  refunds: EvidenceOf<"refund">[],
): { summary: RefundSummary; issues: EvidenceIssue[] } {
  const issues: EvidenceIssue[] = [];
  const issued = refunds.filter((r) => r.status === "issued");
  const pending = refunds.filter((r) => r.status === "pending");
  const failed = refunds.filter((r) => r.status === "failed");

  const issuedTotal = issued.reduce((sum, r) => sum + r.amount, 0);
  let issuedTotalIfDuplicatesMerged = 0;
  const possibleDuplicateRefs: Id[] = [];
  for (const group of groupBy(issued, (r) => canonical({ a: r.amount, t: r.issuedAt ? instant(r.issuedAt) : null })).values()) {
    issuedTotalIfDuplicatesMerged += group[0].amount;
    if (group.length > 1) {
      possibleDuplicateRefs.push(...ids(group));
      issues.push({
        code: "possible_duplicate_refund",
        severity: "warning",
        message: `Refund records ${ids(group).join(", ")} have the same amount and issuedAt and may be one refund recorded twice; with no refund id, each is counted`,
        evidenceRefs: ids(group),
      });
    }
  }
  const uncertain = possibleDuplicateRefs.length > 0;
  const pendingTotal = pending.reduce((sum, r) => sum + r.amount, 0);

  const coverage: RefundSummary["coverage"] =
    issuedTotal === 0
      ? "none"
      : issuedTotal < dispute.amount
        ? "partial"
        : issuedTotal === dispute.amount
          ? "full"
          : "exceeds";

  if (issued.length > 0) {
    issues.push({
      code: "refund_issued",
      severity: "info",
      message:
        `Refunds issued: ${issuedTotal} of ${dispute.amount} paise disputed (${coverage})` +
        (uncertain ? `; ${issuedTotalIfDuplicatesMerged} paise if possible duplicates are one refund` : ""),
      evidenceRefs: ids(issued),
      flag: "refund_issued",
    });
  }
  // Only an excess that survives merging look-alikes is a contradiction. An
  // excess that hinges on an unproven duplicate stays a warning for review.
  const excess: RefundSummary["excess"] =
    issuedTotalIfDuplicatesMerged > dispute.amount ? "confirmed" : issuedTotal > dispute.amount ? "ambiguous" : "none";
  if (excess === "confirmed") {
    issues.push({
      code: "refund_exceeds_amount",
      severity: "error",
      message:
        `Issued refund records total ${issuedTotal} paise, more than the ${dispute.amount} paise disputed` +
        (uncertain ? `; still ${issuedTotalIfDuplicatesMerged} paise with possible duplicates merged` : ""),
      evidenceRefs: ids(issued),
      flag: "contradictory_records",
    });
  } else if (excess === "ambiguous") {
    issues.push({
      code: "refund_excess_ambiguous",
      severity: "warning",
      message:
        `Issued refund records total ${issuedTotal} paise, more than the ${dispute.amount} paise disputed, ` +
        `but only if possible duplicates ${possibleDuplicateRefs.join(", ")} are separate refunds; merged they total ${issuedTotalIfDuplicatesMerged} paise`,
      evidenceRefs: possibleDuplicateRefs,
    });
  }
  if (pending.length > 0) {
    issues.push({
      code: "refund_pending",
      severity: "info",
      message: `Refunds pending: ${pendingTotal} paise across ${pending.length} record(s); not counted as issued`,
      evidenceRefs: ids(pending),
    });
  }
  if (failed.length > 0) {
    issues.push({
      code: "refund_failed",
      severity: "info",
      message: `Failed refund record(s) ${ids(failed).join(", ")}; not counted as issued`,
      evidenceRefs: ids(failed),
    });
  }

  return {
    summary: {
      issuedTotal,
      issuedTotalIfDuplicatesMerged,
      possibleDuplicateRefs,
      pendingTotal,
      issuedCount: issued.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      coverage,
      excess,
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

function checkCompleteness(
  dispute: DisputeMetadata,
  trusted: readonly Evidence[],
  untrusted: readonly ExcludedEvidence[],
  invalid: readonly InvalidEvidence[],
  registry: EvidencePolicyRegistry,
): { result: EvidenceCompleteness; issues: EvidenceIssue[] } {
  const policy = findPolicy(registry, dispute.reasonCode);
  if (!policy) {
    return {
      result: { policy: null, complete: false, requiredCount: 0, satisfiedCount: 0, requirements: [] },
      issues: [
        {
          code: "unsupported_reason_code",
          severity: "error",
          message: "Reason code has no evidence policy; completeness cannot be assessed",
          evidenceRefs: [],
          flag: "unsupported_reason_code",
        },
      ],
    };
  }

  const issues: EvidenceIssue[] = [];
  const requirements: RequirementResult[] = policy.requirements.map((req) => {
    const ofThisType = trusted.filter((record) => record.type === req.type);
    const satisfying = req.satisfiedBy
      ? ofThisType.filter((record) => (req.satisfiedBy as (r: Evidence) => boolean)(record))
      : ofThisType;
    const satisfied = satisfying.length > 0;

    if (!satisfied) {
      const excluded =
        untrusted.filter((record) => record.type === req.type).length +
        invalid.filter((record) => record.type === req.type).length;
      const found = ofThisType.length > 0 ? `${ofThisType.length} trusted record(s) do not qualify` : "none trusted";
      const note = excluded > 0 ? `; ${excluded} invalid or untrusted record(s) of this type were excluded` : "";
      issues.push({
        code: "missing_required_evidence",
        severity: "error",
        message: `Required evidence missing: ${req.description} (${found}${note})`,
        evidenceRefs: ids(ofThisType),
        flag: "missing_evidence",
      });
    }
    return { type: req.type, description: req.description, satisfied, evidenceRefs: ids(satisfying) };
  });

  const satisfiedCount = requirements.filter((req) => req.satisfied).length;
  return {
    result: {
      policy: dispute.reasonCode,
      complete: satisfiedCount === requirements.length,
      requiredCount: requirements.length,
      satisfiedCount,
      requirements,
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function summarize(a: Omit<EvidenceAssessment, "summary">, excludedCount: number): string {
  const parts = [
    `Evidence for dispute ${a.disputeId}: ${a.trustedEvidence.length} trusted, ${a.invalidEvidence.length} invalid, ${excludedCount} excluded.`,
  ];
  const c = a.evidenceCompleteness;
  if (c.policy === null) {
    parts.push("Reason code is unsupported, so completeness was not assessed.");
  } else {
    parts.push(
      `${c.policy}: ${c.satisfiedCount} of ${c.requiredCount} requirements met` +
        (a.missingEvidenceTypes.length ? `; missing ${a.missingEvidenceTypes.join(", ")}.` : "."),
    );
  }
  parts.push(a.flags.length ? `Flags: ${a.flags.join(", ")}.` : "No evidence flags.");
  parts.push("This describes the supplied evidence only and is not a dispute outcome.");
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ofType<T extends EvidenceType>(records: readonly Evidence[], type: T): EvidenceOf<T>[] {
  return records.filter((record): record is EvidenceOf<T> => record.type === type);
}

/** Epoch ms, so "...00Z" and "...00.000Z" compare equal. Inputs are schema-checked. */
function instant(iso: string): number {
  return Date.parse(iso);
}

function ids(records: readonly { id: Id }[]): Id[] {
  return unique(records.map((record) => record.id));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function describeEach<T extends { id: Id }>(records: readonly T[], label: (record: T) => string): string {
  return records.map((record) => `${record.id} ${label(record)}`).join(", ");
}
