import { DisputeSchema, EvidenceSchema, type Evidence } from "../../contracts";
import type { ValidationIssue } from "../model/errors";
import { toIssues } from "../model/parse";
import type { DisputeMetadata, EvidenceIssue, EvidenceType, ExcludedEvidence, InvalidEvidence } from "./types";

// Structural and cross-reference validation. Pure: no clock, no I/O.

const DisputeMetadataSchema = DisputeSchema.omit({ evidence: true });

export const EVIDENCE_TYPES: readonly EvidenceType[] = EvidenceSchema.options.map((option) => option.shape.type.value);

/** Ids echoed back from malformed records must look like ids, not content. */
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

type ParsedDispute =
  | { ok: true; dispute: DisputeMetadata; rawEvidence: unknown[]; issues: EvidenceIssue[] }
  | { ok: false; issues: ValidationIssue[] };

/** Validates dispute metadata; evidence is only checked to be an array here. */
export function parseDispute(input: unknown): ParsedDispute {
  const parsed = DisputeMetadataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: toIssues(parsed.error) };

  const raw = (input as { evidence?: unknown }).evidence;
  if (Array.isArray(raw)) return { ok: true, dispute: parsed.data, rawEvidence: raw, issues: [] };

  const issue: EvidenceIssue =
    raw === undefined
      ? {
          code: "evidence_array_missing",
          severity: "warning",
          message: "Dispute has no evidence array; treated as no evidence",
          evidenceRefs: [],
        }
      : {
          code: "evidence_array_invalid",
          severity: "error",
          message: "Dispute evidence is not an array; no records could be read",
          evidenceRefs: [],
        };
  return { ok: true, dispute: parsed.data, rawEvidence: [], issues: [issue] };
}

/** Validates each record on its own so one bad record cannot sink the rest. */
export function parseRecords(rawEvidence: readonly unknown[]): {
  parsed: Evidence[];
  invalid: InvalidEvidence[];
  issues: EvidenceIssue[];
} {
  const parsed: Evidence[] = [];
  const invalid: InvalidEvidence[] = [];
  const issues: EvidenceIssue[] = [];

  rawEvidence.forEach((raw, index) => {
    const result = EvidenceSchema.safeParse(raw);
    if (result.success) {
      parsed.push(result.data);
      return;
    }
    const record: InvalidEvidence = { index, ...safeIdentity(raw), issues: toIssues(result.error) };
    invalid.push(record);
    issues.push({
      code: "invalid_record",
      severity: "error",
      message: `Evidence at index ${index} failed validation and was not used`,
      evidenceRefs: record.id ? [record.id] : [],
      index,
    });
  });

  return { parsed, invalid, issues };
}

function safeIdentity(raw: unknown): { id?: string; type?: EvidenceType } {
  if (typeof raw !== "object" || raw === null) return {};
  const { id, type } = raw as { id?: unknown; type?: unknown };
  return {
    ...(typeof id === "string" && SAFE_ID.test(id) ? { id } : {}),
    ...(EVIDENCE_TYPES.includes(type as EvidenceType) ? { type: type as EvidenceType } : {}),
  };
}

/**
 * Keeps only records that can back this dispute: owned by it, with an id that
 * resolves to exactly one record, and (for transactions) about the disputed
 * transaction. Everything excluded is reported, never dropped silently.
 * Identical copies of a trusted record are collapsed, not excluded.
 *
 * Records of another dispute are cut out here and only their id and type
 * survive, so another customer's content cannot reach any output.
 */
export function selectTrusted(
  dispute: DisputeMetadata,
  parsed: readonly Evidence[],
): { owned: Evidence[]; trusted: Evidence[]; excluded: ExcludedEvidence[]; issues: EvidenceIssue[] } {
  const issues: EvidenceIssue[] = [];
  const excluded: ExcludedEvidence[] = [];
  const exclude = (record: Evidence, reason: ExcludedEvidence["reason"]) =>
    excluded.push({ id: record.id, type: record.type, reason });

  const owned = parsed.filter((record) => {
    if (record.disputeId === dispute.id) return true;
    issues.push({
      code: "foreign_dispute",
      severity: "error",
      message: `Evidence ${record.id} belongs to another dispute and was not used`,
      evidenceRefs: [record.id],
      flag: "contradictory_records",
    });
    exclude(record, "foreign_dispute");
    return false;
  });

  const byId = new Map<string, Evidence[]>();
  for (const record of owned) byId.set(record.id, [...(byId.get(record.id) ?? []), record]);

  const trusted: Evidence[] = [];
  for (const [id, records] of byId) {
    if (records.length > 1) {
      const variants = new Set(records.map(canonical));
      if (variants.size > 1) {
        issues.push({
          code: "conflicting_duplicate_id",
          severity: "error",
          message: `${records.length} different records share evidence id ${id}; none were used`,
          evidenceRefs: [id],
          flag: "contradictory_records",
        });
        for (const record of records) exclude(record, "conflicting_duplicate_id");
        continue;
      }
      issues.push({
        code: "duplicate_record",
        severity: "info",
        message: `Evidence ${id} appears ${records.length} times with identical content; counted once`,
        evidenceRefs: [id],
      });
    }
    const record = records[0];
    if (record.type === "transaction" && record.transactionId !== dispute.transactionId) {
      issues.push({
        code: "transaction_id_mismatch",
        severity: "error",
        message: `Transaction evidence ${id} is for a different transaction and was not used`,
        evidenceRefs: [id],
        flag: "contradictory_records",
      });
      exclude(record, "transaction_id_mismatch");
      continue;
    }
    trusted.push(record);
  }

  return { owned, trusted, excluded, issues };
}

/** Key-order independent form of a flat record, for equality checks. */
export function canonical(record: object): string {
  return JSON.stringify(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
