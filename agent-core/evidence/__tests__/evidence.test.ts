import { describe, expect, it } from "vitest";
import { FlagSchema, type Flag } from "../../../contracts";
import {
  assessEvidence,
  DEFAULT_EVIDENCE_POLICIES,
  type EvidenceAssessment,
  type EvidenceIssueCode,
  type EvidencePolicyRegistry,
} from "../index";

// Synthetic records only. No network, no database.

const DISPUTE_ID = "d1";
const TXN_ID = "tx1";
const AMOUNT = 50_000;
const T0 = "2026-10-01T10:00:00Z";
const T1 = "2026-10-03T10:00:00Z";
const T2 = "2026-10-05T10:00:00Z";
const COLLECTED = "2026-10-20T10:00:00Z";

type Rec = Record<string, unknown>;

const base = (id: string): Rec => ({ id, disputeId: DISPUTE_ID, collectedAt: COLLECTED });

const txn = (id: string, extra: Rec = {}): Rec => ({
  ...base(id),
  type: "transaction",
  transactionId: TXN_ID,
  amount: AMOUNT,
  status: "success",
  occurredAt: T0,
  ...extra,
});

const delivery = (id: string, status: string, extra: Rec = {}): Rec => ({
  ...base(id),
  type: "delivery_proof",
  kind: "courier_tracking",
  status,
  ...(status === "delivered" ? { deliveredAt: T2 } : {}),
  reference: `AWB-${id}`,
  ...extra,
});

const settlement = (id: string, extra: Rec = {}): Rec => ({
  ...base(id),
  type: "settlement",
  settlementId: "set1",
  amount: AMOUNT,
  status: "settled",
  settledAt: T1,
  ...extra,
});

const refund = (id: string, status: string, amount: number, extra: Rec = {}): Rec => ({
  ...base(id),
  type: "refund",
  amount,
  status,
  ...(status === "issued" ? { issuedAt: T1 } : {}),
  ...extra,
});

const message = (id: string, extra: Rec = {}): Rec => ({
  ...base(id),
  type: "customer_message",
  channel: "whatsapp",
  sentAt: T1,
  content: "Mera order nahi aaya",
  language: "hi",
  ...extra,
});

function dispute(evidence: unknown, extra: Rec = {}): Rec {
  return {
    id: DISPUTE_ID,
    transactionId: TXN_ID,
    amount: AMOUNT,
    reasonCode: "GOODS_NOT_RECEIVED",
    deadline: "2026-11-15T00:00:00Z",
    createdAt: "2026-10-10T00:00:00Z",
    status: "gathering",
    evidence,
    ...extra,
  };
}

/** Assess and require the ok branch. */
function assess(input: unknown, policies?: EvidencePolicyRegistry): EvidenceAssessment {
  const result = assessEvidence(input, policies ? { policies } : undefined);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result;
}

const codes = (a: EvidenceAssessment): EvidenceIssueCode[] => a.issues.map((issue) => issue.code);
const issue = (a: EvidenceAssessment, code: EvidenceIssueCode) => a.issues.find((i) => i.code === code);
const trustedIds = (a: EvidenceAssessment) => a.trustedEvidence.map((r) => r.id);

const clean = () => [txn("e1"), delivery("e2", "delivered")];

// ---------------------------------------------------------------------------
// Basic validation
// ---------------------------------------------------------------------------

describe("basic validation", () => {
  it("1. accepts a valid dispute with complete evidence", () => {
    const a = assess(dispute(clean()));
    expect(a.disputeId).toBe(DISPUTE_ID);
    expect(trustedIds(a)).toEqual(["e1", "e2"]);
    expect(a.invalidEvidence).toEqual([]);
    expect(a.flags).toEqual([]);
    expect(a.presentEvidenceTypes).toEqual(["transaction", "delivery_proof"]);
    expect(a.missingEvidenceTypes).toEqual([]);
    expect(a.evidenceCompleteness).toMatchObject({
      policy: "GOODS_NOT_RECEIVED",
      complete: true,
      requiredCount: 2,
      satisfiedCount: 2,
    });
    expect(a.summary).toContain("2 of 2 requirements met");
    expect(a.summary).toContain("not a dispute outcome");
  });

  it("2. treats a missing evidence array as no evidence", () => {
    const input = dispute(undefined);
    delete input.evidence;
    const a = assess(input);
    expect(codes(a)).toContain("evidence_array_missing");
    expect(a.trustedEvidence).toEqual([]);
    expect(a.missingEvidenceTypes).toEqual(["transaction", "delivery_proof"]);
    expect(a.flags).toEqual(["missing_evidence"]);
  });

  it("2b. reports a non-array evidence field without crashing", () => {
    for (const evidence of [null, "e1", { id: "e1" }]) {
      const a = assess(dispute(evidence));
      expect(codes(a)).toContain("evidence_array_invalid");
      expect(a.flags).toEqual(["missing_evidence"]);
    }
  });

  it("3. handles an empty evidence array", () => {
    const a = assess(dispute([]));
    expect(codes(a)).not.toContain("evidence_array_missing");
    expect(a.trustedEvidence).toEqual([]);
    expect(a.evidenceCompleteness.complete).toBe(false);
    expect(a.flags).toEqual(["missing_evidence"]);
  });

  it("4. rejects invalid dispute metadata with safe issues", () => {
    const secret = "CUSTOMER_SECRET_9999";
    const result = assessEvidence(dispute(clean(), { amount: -5, deadline: secret, status: secret }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_dispute");
    expect(result.error.issues.map((i) => i.path).sort()).toEqual(["amount", "deadline", "status"]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("4b. rejects non-object input and non-UTC timestamps", () => {
    for (const input of [null, undefined, "d1", 42, []]) {
      expect(assessEvidence(input).ok).toBe(false);
    }
    expect(assessEvidence(dispute(clean(), { createdAt: "2026-10-10T05:30:00+05:30" })).ok).toBe(false);
    expect(assessEvidence(dispute(clean(), { createdAt: "yesterday" })).ok).toBe(false);
  });

  it("5. keeps valid records when one record is invalid", () => {
    const a = assess(dispute([txn("e1"), delivery("e2", "delivered"), txn("e3", { amount: "lots" })]));
    expect(trustedIds(a)).toEqual(["e1", "e2"]);
    expect(a.invalidEvidence).toHaveLength(1);
    expect(a.invalidEvidence[0]).toMatchObject({ index: 2, id: "e3", type: "transaction" });
    expect(a.invalidEvidence[0].issues).toEqual([{ path: "amount", message: expect.any(String) }]);
    expect(issue(a, "invalid_record")).toMatchObject({ index: 2, evidenceRefs: ["e3"] });
  });

  it("6. reports every invalid record separately, including messy shapes", () => {
    const secret = "SENSITIVE_CHAT_TEXT_123";
    const input = [
      null,
      { ...txn("e1"), type: "invoice" },
      { ...message("e2"), content: secret, sentAt: "not-a-date" },
      { ...base("e3"), type: "transaction" },
      delivery("e4", "lost"),
      delivery("e5", "delivered", { deliveredAt: undefined }),
      { ...txn("bad id with spaces <script>"), status: "unknown" },
      txn("e7"),
    ];
    const a = assess(dispute(input));
    expect(a.invalidEvidence.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(trustedIds(a)).toEqual(["e7"]);

    expect(a.invalidEvidence[0]).toEqual({ index: 0, issues: [expect.objectContaining({ path: "(root)" })] });
    expect(a.invalidEvidence[1].type).toBeUndefined(); // "invoice" is not a known type
    expect(a.invalidEvidence[2].issues.map((i) => i.path)).toEqual(["sentAt"]);
    expect(a.invalidEvidence[3].issues.length).toBeGreaterThan(1);
    expect(a.invalidEvidence[4].issues.map((i) => i.path)).toEqual(["status"]);
    expect(a.invalidEvidence[5].issues.map((i) => i.path)).toEqual(["deliveredAt"]);
    expect(a.invalidEvidence[6].id).toBeUndefined(); // unsafe id is not echoed

    const serialized = JSON.stringify({ invalid: a.invalidEvidence, issues: a.issues });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("<script>");
  });

  it("does not mutate the input and is deterministic", () => {
    const input = dispute([...clean(), refund("e3", "issued", 100)]);
    const snapshot = JSON.stringify(input);
    expect(assessEvidence(input)).toEqual(assessEvidence(input));
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Ownership and identity
// ---------------------------------------------------------------------------

describe("ownership", () => {
  it("7. never trusts evidence from another dispute", () => {
    const foreign = delivery("e2", "delivered", { disputeId: "d999" });
    const a = assess(dispute([txn("e1"), foreign]));
    expect(a.parsedEvidence.map((r) => r.id)).toEqual(["e1"]);
    expect(a.excludedEvidence).toEqual([{ id: "e2", type: "delivery_proof", reason: "foreign_dispute" }]);
    expect(trustedIds(a)).toEqual(["e1"]);
    expect(issue(a, "foreign_dispute")).toMatchObject({ evidenceRefs: ["e2"], flag: "contradictory_records" });
    // The foreign delivery cannot satisfy the requirement.
    expect(a.missingEvidenceTypes).toEqual(["delivery_proof"]);
    expect(a.flags).toEqual(["missing_evidence", "contradictory_records"]);
    expect(issue(a, "missing_required_evidence")?.message).toContain("1 invalid or untrusted");
  });

  it("8a. collapses exact duplicate ids into one trusted record", () => {
    const a = assess(dispute([txn("e1"), delivery("e2", "delivered"), txn("e1")]));
    expect(trustedIds(a)).toEqual(["e1", "e2"]);
    expect(issue(a, "duplicate_record")?.evidenceRefs).toEqual(["e1"]);
    expect(a.flags).toEqual([]);
  });

  it("8b. distrusts every record when one id has different content", () => {
    const a = assess(dispute([txn("e1"), delivery("e2", "delivered"), txn("e1", { status: "failed" })]));
    expect(trustedIds(a)).toEqual(["e2"]);
    expect(issue(a, "conflicting_duplicate_id")).toMatchObject({ evidenceRefs: ["e1"], flag: "contradictory_records" });
    expect(a.missingEvidenceTypes).toEqual(["transaction"]);
    expect(a.flags).toEqual(["missing_evidence", "contradictory_records"]);
  });

  it("8c. treats key order as irrelevant when comparing duplicates", () => {
    const reordered = Object.fromEntries(Object.entries(txn("e1")).reverse());
    const a = assess(dispute([txn("e1"), reordered, delivery("e2", "delivered")]));
    expect(codes(a)).toContain("duplicate_record");
    expect(a.flags).toEqual([]);
  });

  it("9. does not trust a transaction record for a different transaction", () => {
    const a = assess(dispute([txn("e1", { transactionId: "tx-other" }), delivery("e2", "delivered")]));
    expect(trustedIds(a)).toEqual(["e2"]);
    expect(issue(a, "transaction_id_mismatch")?.evidenceRefs).toEqual(["e1"]);
    expect(a.flags).toEqual(["missing_evidence", "contradictory_records"]);
  });

  it("10. flags a transaction amount that differs from the dispute", () => {
    const a = assess(dispute([txn("e1", { amount: 49_999 }), delivery("e2", "delivered")]));
    expect(trustedIds(a)).toEqual(["e1", "e2"]);
    expect(issue(a, "transaction_amount_mismatch")?.message).toContain("49999");
    expect(a.flags).toEqual(["contradictory_records"]);
  });
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

describe("transactions", () => {
  it("11. a matching successful transaction raises no flag", () => {
    const a = assess(dispute(clean()));
    expect(codes(a).filter((c) => c.startsWith("transaction"))).toEqual([]);
  });

  it("12. failed transaction raises transaction_not_successful", () => {
    const a = assess(dispute([txn("e1", { status: "failed" }), delivery("e2", "delivered")]));
    expect(a.flags).toEqual(["transaction_not_successful"]);
    expect(issue(a, "transaction_not_successful")?.evidenceRefs).toEqual(["e1"]);
  });

  it("13. pending transaction raises transaction_not_successful", () => {
    const a = assess(dispute([txn("e1", { status: "pending" }), delivery("e2", "delivered")]));
    expect(a.flags).toEqual(["transaction_not_successful"]);
  });

  it("14. conflicting transaction records are flagged, not resolved in the merchant's favour", () => {
    const a = assess(
      dispute([txn("e1"), txn("e3", { status: "failed", occurredAt: T1 }), delivery("e2", "delivered")]),
    );
    expect(trustedIds(a)).toEqual(["e1", "e3", "e2"]);
    expect(issue(a, "transaction_conflict")?.evidenceRefs).toEqual(["e1", "e3"]);
    expect(a.flags).toEqual(["contradictory_records"]);
    expect(a.flags).not.toContain("transaction_not_successful");
  });

  it("14b. conflicting amounts on the same transaction are flagged", () => {
    const a = assess(dispute([txn("e1"), txn("e3", { amount: 1 }), delivery("e2", "delivered")]));
    expect(codes(a)).toEqual(expect.arrayContaining(["transaction_conflict", "transaction_amount_mismatch"]));
    expect(a.flags).toEqual(["contradictory_records"]);
  });

  it("14c. identical transaction records under different ids are a duplicate, not a conflict", () => {
    const a = assess(dispute([txn("e1"), txn("e3"), delivery("e2", "delivered")]));
    expect(issue(a, "duplicate_transaction_record")?.evidenceRefs).toEqual(["e1", "e3"]);
    expect(a.flags).toEqual([]);
  });

  // Regression: pending then final is progression when collectedAt orders it.
  describe("pending progression", () => {
    const EARLY = "2026-10-01T10:05:00Z";
    const pending = (id: string, extra: Rec = {}) => txn(id, { status: "pending", collectedAt: EARLY, ...extra });
    const run = (...records: Rec[]) => assess(dispute([...records, delivery("e2", "delivered")]));

    it("pending collected before success is normal progression", () => {
      const a = run(pending("p1"), txn("e1"));
      expect(issue(a, "transaction_progression")?.evidenceRefs).toEqual(["p1", "e1"]);
      expect(codes(a)).not.toContain("transaction_conflict");
      expect(a.flags).toEqual([]);
    });

    it("pending and final with the same occurredAt raise no occurredAt warning", () => {
      const a = run(pending("p1"), txn("e1"));
      expect(codes(a)).not.toContain("transaction_occurred_at_differs");
    });

    // Regression: occurredAt never establishes or refutes the transition.
    it("collectedAt alone orders the snapshots, whichever way occurredAt points", () => {
      for (const occurredAt of ["2026-10-01T10:01:00Z", "2026-09-30T10:00:00Z"]) {
        const a = run(pending("p1", { occurredAt }), txn("e1"));
        expect(codes(a), occurredAt).toContain("transaction_progression");
        expect(codes(a), occurredAt).not.toContain("transaction_conflict");
        expect(issue(a, "transaction_occurred_at_differs")).toMatchObject({ severity: "warning", evidenceRefs: ["p1", "e1"] });
        expect(issue(a, "transaction_occurred_at_differs")?.flag).toBeUndefined();
        expect(a.flags, occurredAt).toEqual([]);
      }
    });

    it("a favourable occurredAt order does not rescue an unordered collectedAt", () => {
      // pending occurred earlier, but both snapshots were collected at once
      const a = run(pending("p1", { collectedAt: COLLECTED, occurredAt: "2026-09-30T10:00:00Z" }), txn("e1"));
      expect(issue(a, "transaction_conflict")?.message).toContain("not collected strictly before");
      expect(codes(a)).not.toContain("transaction_progression");
      expect(a.flags).toEqual(["contradictory_records"]);
    });

    it("needs every pending snapshot before every final one", () => {
      const ordered = run(pending("p1"), pending("p2", { collectedAt: "2026-10-02T00:00:00Z" }), txn("e1"));
      expect(codes(ordered)).toContain("transaction_progression");
      expect(ordered.flags).toEqual([]);

      const interleaved = run(
        pending("p1"),
        txn("e1"),
        txn("e3", { collectedAt: "2026-10-02T00:00:00Z" }),
        pending("p2", { collectedAt: "2026-10-10T00:00:00Z" }),
      );
      expect(codes(interleaved)).toContain("transaction_conflict");
      expect(interleaved.flags).toEqual(["contradictory_records"]);
    });

    // Regression: occurredAt is undocumented, so differing values never
    // change the consistency result, for the same or different statuses.
    it("same-status records with different occurredAt do not conflict", () => {
      const a = run(txn("e1"), txn("e3", { occurredAt: T1 }));
      expect(codes(a)).not.toContain("transaction_conflict");
      expect(issue(a, "transaction_occurred_at_differs")).toMatchObject({
        severity: "warning",
        evidenceRefs: ["e1", "e3"],
      });
      expect(issue(a, "transaction_occurred_at_differs")?.flag).toBeUndefined();
      expect(a.flags).toEqual([]);
    });

    const CONSISTENCY_CODES: EvidenceIssueCode[] = [
      "transaction_conflict",
      "transaction_progression",
      "transaction_not_successful",
      "transaction_amount_mismatch",
      "transaction_id_mismatch",
    ];
    const consistency = (a: EvidenceAssessment) => ({
      flags: a.flags,
      trusted: trustedIds(a),
      issues: a.issues
        .filter((i) => CONSISTENCY_CODES.includes(i.code))
        .map((i) => ({ code: i.code, refs: i.evidenceRefs, flag: i.flag, message: i.message })),
    });
    const spreadOccurredAt = (records: Rec[]) =>
      records.map((r, i) => (r.type === "transaction" ? { ...r, occurredAt: `2026-09-${10 + i}T0${i}:00:00Z` } : r));

    it.each([
      ["two identical successes", [txn("e1"), txn("e3")]],
      ["pending then success", [pending("p1"), txn("e1")]],
      ["pending then failed", [pending("p1"), txn("e1", { status: "failed" })]],
      ["several pending snapshots then success", [pending("p1"), pending("p2", { collectedAt: T1 }), txn("e1")]],
      ["success and failed", [txn("e1"), txn("e3", { status: "failed" })]],
      ["pending collected after success", [pending("p1", { collectedAt: "2026-10-25T00:00:00Z" }), txn("e1")]],
      ["pending collected at the same instant", [pending("p1", { collectedAt: COLLECTED }), txn("e1")]],
      ["conflicting amounts", [txn("e1"), txn("e3", { amount: 1 })]],
      ["two pending snapshots only", [pending("p1"), pending("p2", { collectedAt: T1 })]],
      ["wrong transaction id", [txn("e1"), txn("e3", { transactionId: "tx-other" })]],
    ] as const)("%s: occurredAt differences leave the result unchanged", (_label, records) => {
      const same = run(...records);
      const spread = run(...spreadOccurredAt([...records]));
      expect(consistency(spread)).toEqual(consistency(same));
      expect(codes(same)).not.toContain("transaction_occurred_at_differs");
      const warning = issue(spread, "transaction_occurred_at_differs");
      if (spread.trustedEvidence.filter((r) => r.type === "transaction").length > 1) {
        expect(warning).toMatchObject({ severity: "warning" });
        expect(warning?.flag).toBeUndefined();
      }
      for (const i of spread.issues) expect(i.message).not.toMatch(/occurredAt.*(conflict|disagree)/);
    });

    it("pending then failed is progression to an unsuccessful transaction", () => {
      const a = run(pending("p1"), txn("e1", { status: "failed" }));
      expect(codes(a)).toContain("transaction_progression");
      expect(a.flags).toEqual(["transaction_not_successful"]);
    });

    it.each([
      ["pending collected after success", { collectedAt: "2026-10-25T00:00:00Z" }],
      ["pending collected at the same instant", { collectedAt: COLLECTED }],
      ["pending collected at the same instant in another format", { collectedAt: "2026-10-20T10:00:00.000Z" }],
    ])("%s is a conflict", (_label, extra) => {
      const a = run(pending("p1", extra), txn("e1"));
      expect(codes(a)).toContain("transaction_conflict");
      expect(codes(a)).not.toContain("transaction_progression");
      expect(a.flags).toEqual(["contradictory_records"]);
    });

    it("pending with a different amount is a conflict, not progression", () => {
      const a = run(pending("p1", { amount: AMOUNT + 1 }), txn("e1"));
      expect(issue(a, "transaction_conflict")?.message).toContain("amounts differ");
    });

    it("success and failed together stay a conflict whatever the order", () => {
      const a = run(pending("p1"), txn("e1"), txn("e3", { status: "failed" }));
      expect(issue(a, "transaction_conflict")?.message).toContain("both success and failed");
    });

    it("treats the same instant with and without milliseconds as one time", () => {
      const a = run(txn("e1"), txn("e3", { occurredAt: "2026-10-01T10:00:00.000Z" }));
      expect(codes(a)).not.toContain("transaction_conflict");
      expect(codes(a)).toContain("duplicate_transaction_record");
    });
  });
});

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

describe("delivery", () => {
  it("15. delivered evidence satisfies GOODS_NOT_RECEIVED", () => {
    const a = assess(dispute(clean()));
    expect(a.evidenceCompleteness.requirements[1]).toEqual({
      type: "delivery_proof",
      description: "delivery_proof",
      satisfied: true,
      evidenceRefs: ["e2"],
    });
    expect(a.delivery).toEqual({ statuses: ["delivered"], deliveredRefs: ["e2"] });
  });

  // Regression: unfavourable delivery records are evidence, not missing
  // evidence. The status is reported for the decision layer to interpret.
  it.each([
    ["16", "in_transit", "delivery_in_transit"],
    ["17", "returned_to_origin", "delivery_returned_to_origin"],
    ["18", "failed", "delivery_failed"],
    ["19", "unknown", "delivery_status_unknown"],
  ] as const)("%s. %s is present evidence that does not confirm delivery", (_n, status, code) => {
    const a = assess(dispute([txn("e1"), delivery("e2", status)]));
    expect(issue(a, code)?.evidenceRefs).toEqual(["e2"]);
    expect(issue(a, code)?.message).toContain("does not confirm delivery");
    expect(a.presentEvidenceTypes).toContain("delivery_proof");
    expect(a.missingEvidenceTypes).toEqual([]);
    expect(a.evidenceCompleteness.complete).toBe(true);
    expect(a.flags).toEqual([]);
    expect(a.delivery).toEqual({ statuses: [status], deliveredRefs: [] });
  });

  it("20. delivered and returned_to_origin together are contradictory", () => {
    const a = assess(dispute([txn("e1"), delivery("e2", "delivered"), delivery("e3", "returned_to_origin")]));
    expect(issue(a, "delivery_conflict")?.evidenceRefs).toEqual(["e2", "e3"]);
    expect(trustedIds(a)).toEqual(["e1", "e2", "e3"]); // both kept, neither discarded
    expect(a.flags).toEqual(["contradictory_records"]);
  });

  it("20b. delivered and failed together are contradictory", () => {
    const a = assess(dispute([txn("e1"), delivery("e2", "failed"), delivery("e3", "delivered")]));
    expect(a.flags).toEqual(["contradictory_records"]);
  });

  it("21. in_transit followed by delivered is progression, not a contradiction", () => {
    const a = assess(dispute([txn("e1"), delivery("e2", "in_transit"), delivery("e3", "delivered")]));
    expect(issue(a, "delivery_progression")?.severity).toBe("info");
    expect(codes(a)).not.toContain("delivery_conflict");
    expect(a.flags).toEqual([]);
  });

  it("21b. unknown status next to delivered is not a contradiction", () => {
    const a = assess(dispute([txn("e1"), delivery("e2", "unknown"), delivery("e3", "delivered")]));
    expect(a.flags).toEqual([]);
    expect(codes(a)).toContain("delivery_status_unknown");
  });

  it("missing delivery proof is missing evidence", () => {
    const a = assess(dispute([txn("e1")]));
    expect(a.missingEvidenceTypes).toEqual(["delivery_proof"]);
    expect(issue(a, "missing_required_evidence")?.message).toContain("none trusted");
  });
});

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

describe("settlement", () => {
  const withSettlement = (...records: Rec[]) => dispute([...clean(), ...records]);

  it("22. settled evidence raises nothing", () => {
    const a = assess(withSettlement(settlement("e3")));
    expect(codes(a).filter((c) => c.includes("settlement"))).toEqual([]);
    expect(a.presentEvidenceTypes).toContain("settlement");
  });

  it("23. pending settlement is informational", () => {
    const a = assess(withSettlement(settlement("e3", { status: "pending", settledAt: undefined })));
    expect(issue(a, "settlement_pending")?.severity).toBe("info");
    expect(a.flags).toEqual([]);
  });

  it("24. failed settlement is reported without a flag", () => {
    const a = assess(withSettlement(settlement("e3", { status: "failed", settledAt: undefined })));
    expect(issue(a, "settlement_failed")?.evidenceRefs).toEqual(["e3"]);
    expect(a.flags).toEqual([]);
  });

  it("24b. settled without settledAt is invalid; settledAt on a pending record is a warning", () => {
    const a = assess(withSettlement(settlement("e3", { settledAt: undefined })));
    expect(a.invalidEvidence[0]).toMatchObject({ id: "e3", issues: [{ path: "settledAt" }] });
    const b = assess(withSettlement(settlement("e4", { status: "pending" })));
    expect(codes(b)).toContain("settlement_timestamp_unexpected");
  });

  it("25. a settlement net of fees is not a contradiction", () => {
    const a = assess(withSettlement(settlement("e3", { amount: AMOUNT - 1_180 })));
    expect(a.flags).toEqual([]);
    expect(a.issues.filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("25b. a batch settlement larger than the transaction is not a contradiction", () => {
    const a = assess(withSettlement(settlement("e3", { amount: AMOUNT * 40 })));
    expect(a.flags).toEqual([]);
  });

  it("duplicate settlement records are noted; disagreeing ones conflict", () => {
    const dup = assess(withSettlement(settlement("e3"), settlement("e4")));
    expect(issue(dup, "duplicate_settlement_record")?.evidenceRefs).toEqual(["e3", "e4"]);
    expect(dup.flags).toEqual([]);

    const clash = assess(withSettlement(settlement("e3"), settlement("e4", { status: "failed", settledAt: undefined })));
    expect(issue(clash, "settlement_conflict")?.evidenceRefs).toEqual(["e3", "e4"]);
    expect(clash.flags).toEqual(["contradictory_records"]);

    const separate = assess(withSettlement(settlement("e3"), settlement("e4", { settlementId: "set2" })));
    expect(separate.flags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

describe("refunds", () => {
  const withRefunds = (...records: Rec[]) => dispute([...clean(), ...records]);

  it("26. a full issued refund raises refund_issued only", () => {
    const a = assess(withRefunds(refund("e3", "issued", AMOUNT)));
    expect(a.flags).toEqual(["refund_issued"]);
    expect(a.refunds).toMatchObject({ issuedTotal: AMOUNT, issuedCount: 1, coverage: "full" });
  });

  it("27. a pending refund is not counted as issued", () => {
    const a = assess(withRefunds(refund("e3", "pending", 10_000)));
    expect(a.flags).toEqual([]);
    expect(a.refunds).toMatchObject({ issuedTotal: 0, pendingTotal: 10_000, pendingCount: 1, coverage: "none" });
    expect(codes(a)).toContain("refund_pending");
  });

  it("28. a failed refund is not counted as issued", () => {
    const a = assess(withRefunds(refund("e3", "failed", AMOUNT)));
    expect(a.flags).toEqual([]);
    expect(a.refunds).toMatchObject({ issuedTotal: 0, failedCount: 1, coverage: "none" });
    expect(codes(a)).toContain("refund_failed");
  });

  it("29. partial refunds are aggregated and reported as partial", () => {
    const a = assess(
      withRefunds(refund("e3", "issued", 10_000), refund("e4", "issued", 15_000, { issuedAt: T2 })),
    );
    expect(a.refunds).toMatchObject({ issuedTotal: 25_000, issuedCount: 2, coverage: "partial" });
    expect(issue(a, "refund_issued")?.message).toContain("25000 of 50000");
    expect(a.flags).toEqual(["refund_issued"]);
  });

  // Regression: look-alike refunds without a refund id are both counted, and
  // the merged figure is reported next to the total instead of replacing it.
  it("30. possible duplicate refunds are counted, reported and never merged silently", () => {
    const a = assess(withRefunds(refund("e3", "issued", 20_000), refund("e4", "issued", 20_000)));
    expect(a.refunds).toMatchObject({
      issuedTotal: 40_000,
      issuedTotalIfDuplicatesMerged: 20_000,
      possibleDuplicateRefs: ["e3", "e4"],
      issuedCount: 2,
      coverage: "partial",
    });
    expect(trustedIds(a)).toEqual(expect.arrayContaining(["e3", "e4"]));
    expect(issue(a, "possible_duplicate_refund")?.evidenceRefs).toEqual(["e3", "e4"]);
    expect(issue(a, "refund_issued")?.message).toContain("20000 paise if possible duplicates are one refund");
    expect(a.flags).toEqual(["refund_issued"]);
  });

  // Regression: an excess that exists only if an unproven duplicate is a
  // separate refund is ambiguous, not a contradiction.
  it("30b. excess that depends on possible duplicates is ambiguous, not contradictory", () => {
    const a = assess(withRefunds(refund("e3", "issued", 30_000), refund("e4", "issued", 30_000)));
    expect(a.refunds).toMatchObject({
      issuedTotal: 60_000,
      issuedTotalIfDuplicatesMerged: 30_000,
      possibleDuplicateRefs: ["e3", "e4"],
      coverage: "exceeds",
      excess: "ambiguous",
    });
    expect(issue(a, "refund_excess_ambiguous")).toMatchObject({ severity: "warning", evidenceRefs: ["e3", "e4"] });
    expect(issue(a, "refund_excess_ambiguous")?.flag).toBeUndefined();
    expect(issue(a, "refund_excess_ambiguous")?.message).toContain("merged they total 30000 paise");
    expect(codes(a)).not.toContain("refund_exceeds_amount");
    expect(a.flags).toEqual(["refund_issued"]);
  });

  it("30b2. excess that survives merging possible duplicates is confirmed", () => {
    const a = assess(
      withRefunds(
        refund("e3", "issued", 30_000),
        refund("e4", "issued", 30_000),
        refund("e5", "issued", 30_000, { issuedAt: T2 }),
      ),
    );
    expect(a.refunds).toMatchObject({ issuedTotal: 90_000, issuedTotalIfDuplicatesMerged: 60_000, excess: "confirmed" });
    expect(issue(a, "refund_exceeds_amount")?.message).toContain("still 60000 paise with possible duplicates merged");
    expect(codes(a)).not.toContain("refund_excess_ambiguous");
    expect(a.flags).toEqual(["contradictory_records", "refund_issued"]);
  });

  it("30b3. an exact total with possible duplicates is not excess", () => {
    const a = assess(withRefunds(refund("e3", "issued", 25_000), refund("e4", "issued", 25_000)));
    expect(a.refunds).toMatchObject({ issuedTotal: AMOUNT, coverage: "full", excess: "none" });
    expect(a.flags).toEqual(["refund_issued"]);
  });

  it("30c. distinct refunds report no duplicates and equal totals", () => {
    const a = assess(withRefunds(refund("e3", "issued", 30_000), refund("e4", "issued", 30_000, { issuedAt: T2 })));
    expect(a.refunds).toMatchObject({ issuedTotalIfDuplicatesMerged: 60_000, possibleDuplicateRefs: [] });
    expect(codes(a)).not.toContain("possible_duplicate_refund");
  });

  it("30d. the same refund instant written with and without milliseconds is a possible duplicate", () => {
    const a = assess(
      withRefunds(refund("e3", "issued", 100), refund("e4", "issued", 100, { issuedAt: "2026-10-03T10:00:00.000Z" })),
    );
    expect(a.refunds.possibleDuplicateRefs).toEqual(["e3", "e4"]);
  });

  it("31. issued refunds above the disputed amount are contradictory", () => {
    const a = assess(withRefunds(refund("e3", "issued", 30_000), refund("e4", "issued", 30_000, { issuedAt: T2 })));
    expect(a.refunds).toMatchObject({ issuedTotal: 60_000, coverage: "exceeds", excess: "confirmed" });
    expect(issue(a, "refund_exceeds_amount")?.evidenceRefs).toEqual(["e3", "e4"]);
    expect(a.flags).toEqual(["contradictory_records", "refund_issued"]);
  });

  it("issued refund without issuedAt is invalid, not trusted", () => {
    const a = assess(withRefunds(refund("e3", "issued", 100, { issuedAt: undefined })));
    expect(a.invalidEvidence[0]).toMatchObject({ id: "e3", type: "refund" });
    expect(a.flags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Completeness and policies
// ---------------------------------------------------------------------------

describe("completeness", () => {
  it("32. each default policy has requirements and a supported code assesses them", () => {
    for (const [code, policy] of Object.entries(DEFAULT_EVIDENCE_POLICIES)) {
      expect(policy.requirements.length, code).toBeGreaterThan(0);
    }
    const a = assess(dispute([txn("e1"), refund("e2", "pending", AMOUNT)], { reasonCode: "CREDIT_NOT_PROCESSED" }));
    expect(a.evidenceCompleteness).toMatchObject({ policy: "CREDIT_NOT_PROCESSED", complete: true });
    expect(a.flags).toEqual([]);
  });

  it("32b. a failed refund is present evidence for CREDIT_NOT_PROCESSED", () => {
    const a = assess(dispute([txn("e1"), refund("e2", "failed", AMOUNT)], { reasonCode: "CREDIT_NOT_PROCESSED" }));
    expect(a.evidenceCompleteness.complete).toBe(true);
    expect(a.refunds).toMatchObject({ issuedTotal: 0, failedCount: 1, coverage: "none" });
    expect(a.flags).toEqual([]);
  });

  // Regression: main's fixtures use "13.1"; it is an exact prototype alias.
  it("32d. reason code 13.1 is an exact alias of GOODS_NOT_RECEIVED", () => {
    const alias = DEFAULT_EVIDENCE_POLICIES["13.1"];
    expect(alias.requirements).toBe(DEFAULT_EVIDENCE_POLICIES.GOODS_NOT_RECEIVED.requirements);
    expect(alias.description).toMatch(/^Prototype alias/);

    const a = assess(dispute(clean(), { reasonCode: "13.1" }));
    expect(a.flags).toEqual([]);
    expect(a.evidenceCompleteness).toMatchObject({ policy: "13.1", complete: true, requiredCount: 2 });
    const b = assess(dispute([delivery("e2", "delivered")], { reasonCode: "13.1" }));
    expect(b.missingEvidenceTypes).toEqual(["transaction"]);
  });

  it("32e. no fuzzy matching around 13.1", () => {
    for (const reasonCode of ["13", "13.10", "13.2", " 13.1", "13.1 ", "13,1", "13.1.0"]) {
      expect(assess(dispute(clean(), { reasonCode })).flags, JSON.stringify(reasonCode)).toEqual([
        "unsupported_reason_code",
      ]);
    }
  });

  // Regression: the contract cannot show a second charge, so no policy claims to.
  it("32c. DUPLICATE_TRANSACTION is unsupported by the default policy", () => {
    expect(Object.keys(DEFAULT_EVIDENCE_POLICIES)).not.toContain("DUPLICATE_TRANSACTION");
    const a = assess(dispute([txn("e1"), settlement("e2")], { reasonCode: "DUPLICATE_TRANSACTION" }));
    expect(a.flags).toEqual(["unsupported_reason_code"]);
    expect(a.evidenceCompleteness.policy).toBeNull();
  });

  it("33. missing transaction evidence is reported", () => {
    const a = assess(dispute([delivery("e2", "delivered")]));
    expect(a.missingEvidenceTypes).toEqual(["transaction"]);
    expect(a.evidenceCompleteness).toMatchObject({ complete: false, requiredCount: 2, satisfiedCount: 1 });
    expect(a.flags).toEqual(["missing_evidence"]);
  });

  it("34. missing delivery evidence is reported, even with other evidence present", () => {
    const a = assess(dispute([txn("e1"), message("e2"), settlement("e3")]));
    expect(a.missingEvidenceTypes).toEqual(["delivery_proof"]);
    expect(a.flags).toEqual(["missing_evidence"]);
  });

  it("35. unknown reason codes are unsupported, not complete and not missing", () => {
    for (const reasonCode of ["SOMETHING_ELSE", "goods_not_received", "constructor", "__proto__"]) {
      const a = assess(dispute(clean(), { reasonCode }));
      expect(a.flags, reasonCode).toEqual(["unsupported_reason_code"]);
      expect(a.evidenceCompleteness).toEqual({
        policy: null,
        complete: false,
        requiredCount: 0,
        satisfiedCount: 0,
        requirements: [],
      });
      expect(a.missingEvidenceTypes).toEqual([]);
      expect(a.summary).toContain("unsupported");
    }
  });

  it("36. accepts a custom policy registry", () => {
    const policies: EvidencePolicyRegistry = {
      ...DEFAULT_EVIDENCE_POLICIES,
      SERVICE_NOT_RENDERED: {
        description: "Synthetic test policy",
        requirements: [
          { type: "transaction", description: "transaction" },
          { type: "delivery_proof", description: "service log", satisfiedBy: (r) => r.kind === "service_log" },
          { type: "customer_message", description: "customer_message" },
        ],
      },
    };
    const input = dispute([txn("e1"), delivery("e2", "delivered")], { reasonCode: "SERVICE_NOT_RENDERED" });
    const a = assess(input, policies);
    expect(a.missingEvidenceTypes).toEqual(["delivery_proof", "customer_message"]);
    expect(a.evidenceCompleteness.requiredCount).toBe(3);
    expect(issue(a, "missing_required_evidence")?.message).toContain("1 trusted record(s) do not qualify");

    const b = assess(
      dispute([txn("e1"), delivery("e2", "delivered", { kind: "service_log" }), message("e3")], {
        reasonCode: "SERVICE_NOT_RENDERED",
      }),
      policies,
    );
    expect(b.evidenceCompleteness.complete).toBe(true);
    // The default registry does not know the code.
    expect(assess(input).flags).toEqual(["unsupported_reason_code"]);
  });
});

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

describe("output", () => {
  const messy = () =>
    dispute([
      txn("e1"),
      txn("e1"),
      txn("e5", { status: "failed", occurredAt: T1 }),
      delivery("e2", "delivered"),
      delivery("e3", "returned_to_origin"),
      delivery("e9", "delivered", { disputeId: "d2" }),
      refund("e4", "issued", 40_000),
      refund("e6", "issued", 40_000, { issuedAt: T2 }),
      null,
    ]);

  it("37. flags are unique, in FlagSchema order, and evidence-only", () => {
    const a = assess(messy());
    expect(a.flags).toEqual(["contradictory_records", "refund_issued"]);
    expect(new Set(a.flags).size).toBe(a.flags.length);
    const order = FlagSchema.options;
    expect([...a.flags].sort((x, y) => order.indexOf(x) - order.indexOf(y))).toEqual(a.flags);

    const forbidden: Flag[] = ["amount_over_limit", "low_confidence", "model_failure", "deadline_expired", "deadline_at_risk"];
    // Even with a past deadline the module does not judge deadlines.
    const late = assess(dispute(clean(), { deadline: "2000-01-01T00:00:00Z", amount: 2_000_000_000 }));
    for (const result of [a, late]) {
      expect(result.flags.filter((f) => forbidden.includes(f))).toEqual([]);
    }
  });

  it("38. evidence references are unique", () => {
    const a = assess(messy());
    expect(a.evidenceRefs).toEqual(["e1", "e5", "e2", "e3", "e4", "e6"]);
    expect(new Set(a.evidenceRefs).size).toBe(a.evidenceRefs.length);
    for (const i of a.issues) expect(new Set(i.evidenceRefs).size).toBe(i.evidenceRefs.length);
  });

  it("39. every trusted reference resolves to a record of this dispute", () => {
    const a = assess(messy());
    expect(a.evidenceRefs).not.toContain("e9");
    for (const ref of a.evidenceRefs) {
      const records = a.trustedEvidence.filter((r) => r.id === ref);
      expect(records).toHaveLength(1);
      expect(records[0].disputeId).toBe(DISPUTE_ID);
    }
    for (const req of a.evidenceCompleteness.requirements) {
      for (const ref of req.evidenceRefs) expect(a.evidenceRefs).toContain(ref);
    }
  });

  it("39b. untrusted and malformed records never become trusted or satisfy a requirement", () => {
    const a = assess(
      dispute([
        txn("x-foreign", { disputeId: "d2" }),
        txn("x-other-txn", { transactionId: "tx-other" }),
        delivery("x-clash", "delivered"),
        delivery("x-clash", "returned_to_origin"),
        { ...delivery("x-bad", "delivered"), deliveredAt: "soon" },
        message("e1"),
      ]),
    );
    const untrusted = ["x-foreign", "x-other-txn", "x-clash", "x-bad"];
    const reachable = [
      ...a.evidenceRefs,
      ...a.trustedEvidence.map((r) => r.id),
      ...a.evidenceCompleteness.requirements.flatMap((r) => r.evidenceRefs),
      ...a.delivery.deliveredRefs,
    ];
    expect(reachable.filter((id) => untrusted.includes(id))).toEqual([]);
    expect(a.parsedEvidence.map((r) => r.id)).not.toContain("x-bad");
    expect(a.invalidEvidence).toEqual([
      { index: 4, id: "x-bad", type: "delivery_proof", issues: [{ path: "deliveredAt", message: expect.any(String) }] },
    ]);
    expect(a.missingEvidenceTypes).toEqual(["transaction", "delivery_proof"]);
    expect(a.flags).toEqual(["missing_evidence", "contradictory_records"]);
  });

  // Regression: another dispute's records leave only id, type and reason.
  it("39c. foreign-dispute content appears nowhere in the output", () => {
    const FOREIGN = "dsp-foreign-77";
    const secret = "OTHER_CUSTOMER_PRIVATE_NOTE_5521";
    const a = assess(
      dispute([
        txn("e1"),
        delivery("f-pod", "delivered", { disputeId: FOREIGN, reference: "SECRET-AWB-9" }),
        message("f-msg", { disputeId: FOREIGN, content: secret }),
        refund("f-ref", "issued", 12_345, { disputeId: FOREIGN }),
        txn("x-other-txn", { transactionId: "tx-other" }),
      ]),
    );
    const foreignIds = ["f-pod", "f-msg", "f-ref"];

    const serialized = JSON.stringify(a);
    for (const leaked of [secret, FOREIGN, "SECRET-AWB-9", "12345"]) expect(serialized).not.toContain(leaked);

    const collections = {
      parsed: a.parsedEvidence.map((r) => r.id),
      trusted: a.trustedEvidence.map((r) => r.id),
      refs: a.evidenceRefs,
      delivered: a.delivery.deliveredRefs,
      required: a.evidenceCompleteness.requirements.flatMap((r) => r.evidenceRefs),
      refunds: a.refunds.possibleDuplicateRefs,
    };
    for (const [name, list] of Object.entries(collections)) {
      expect(list.filter((id) => foreignIds.includes(id)), name).toEqual([]);
    }
    // The model input is built from trustedEvidence only.
    const modelInput = JSON.stringify({ dispute: a.dispute, evidence: a.trustedEvidence, flags: a.flags });
    for (const id of [...foreignIds, "x-other-txn"]) expect(modelInput).not.toContain(id);

    expect(a.excludedEvidence).toEqual([
      { id: "f-pod", type: "delivery_proof", reason: "foreign_dispute" },
      { id: "f-msg", type: "customer_message", reason: "foreign_dispute" },
      { id: "f-ref", type: "refund", reason: "foreign_dispute" },
      { id: "x-other-txn", type: "transaction", reason: "transaction_id_mismatch" },
    ]);
    // Same-dispute records excluded for other reasons stay in parsedEvidence.
    expect(collections.parsed).toEqual(["e1", "x-other-txn"]);
    expect(a.issues.filter((i) => i.code === "foreign_dispute").flatMap((i) => i.evidenceRefs)).toEqual(foreignIds);
    expect(a.refunds.issuedCount).toBe(0);
    expect(a.flags).toEqual(["missing_evidence", "contradictory_records"]);
    expect(a.summary).toContain("4 excluded");
  });

  it("40. produces no action, confidence or recommendation", () => {
    const a = assess(messy());
    const keys = Object.keys(a);
    for (const key of ["finalAction", "action", "confidence", "recommendation", "modelOutput"]) {
      expect(keys).not.toContain(key);
    }
    const text = JSON.stringify({ summary: a.summary, issues: a.issues.map((i) => i.message) }).toLowerCase();
    for (const word of ["defend", "accept", "escalate", " won", "win "]) expect(text).not.toContain(word);
  });

  it("summary reflects counts and flags deterministically", () => {
    const a = assess(messy());
    expect(a.summary).toBe(
      "Evidence for dispute d1: 6 trusted, 1 invalid, 1 excluded. " +
        "GOODS_NOT_RECEIVED: 2 of 2 requirements met. " +
        "Flags: contradictory_records, refund_issued. " +
        "This describes the supplied evidence only and is not a dispute outcome.",
    );
  });
});
