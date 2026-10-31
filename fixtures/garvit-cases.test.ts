import { describe, expect, it } from "vitest";
import { ActionSchema, DisputeSchema, EvidenceSchema } from "../contracts";
import { assessEvidence, type EvidenceAssessment } from "../agent-core/evidence";
import { garvitCases } from "./garvit-cases";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const TIME_KEYS = ["deadline", "createdAt", "collectedAt", "occurredAt", "settledAt", "deliveredAt", "issuedAt", "sentAt"];

function assessed(index: number): EvidenceAssessment {
  const result = assessEvidence(garvitCases[index].dispute);
  if (!result.ok) throw new Error("fixture dispute failed validation");
  return result;
}

describe("garvit fixtures", () => {
  it("has exactly one defend, one accept and one escalate case", () => {
    expect(garvitCases).toHaveLength(3);
    expect(garvitCases.map((c) => ActionSchema.parse(c.expectedAction))).toEqual(["defend", "accept", "escalate"]);
  });

  it.each(garvitCases.map((c, i) => [i, c] as const))("case %i passes the contract schemas", (_i, { dispute }) => {
    expect(DisputeSchema.safeParse(dispute).error).toBeUndefined();
    expect(dispute.evidence.length).toBeGreaterThan(1);
    for (const record of dispute.evidence) {
      expect(EvidenceSchema.safeParse(record).error, record.id).toBeUndefined();
      expect(record.disputeId).toBe(dispute.id);
      if (record.type === "transaction") expect(record.transactionId).toBe(dispute.transactionId);
    }
    for (const value of [dispute, ...dispute.evidence]) {
      for (const [key, v] of Object.entries(value)) {
        if (TIME_KEYS.includes(key)) expect(v, key).toMatch(ISO_UTC);
        if (key === "amount") expect(Number.isInteger(v), key).toBe(true);
      }
    }
    expect(new Set(dispute.evidence.map((e) => e.id)).size).toBe(dispute.evidence.length);
  });

  it("defend case: complete, delivered, no evidence flags", () => {
    const a = assessed(0);
    expect(a.flags).toEqual([]);
    expect(a.evidenceCompleteness.complete).toBe(true);
    expect(a.delivery).toEqual({ statuses: ["delivered"], deliveredRefs: ["ev_gm_001_pod"] });
    expect(a.invalidEvidence).toEqual([]);
  });

  it("accept case: complete but the courier returned the parcel and no refund was issued", () => {
    const a = assessed(1);
    expect(a.flags).toEqual([]);
    expect(a.evidenceCompleteness.complete).toBe(true);
    expect(a.delivery).toEqual({ statuses: ["in_transit", "returned_to_origin"], deliveredRefs: [] });
    expect(a.refunds.issuedCount).toBe(0);
  });

  it("escalate case: delivery records contradict each other", () => {
    const a = assessed(2);
    expect(a.flags).toEqual(["contradictory_records", "refund_issued"]);
    expect(a.issues.find((i) => i.code === "delivery_conflict")?.evidenceRefs).toEqual([
      "ev_gm_003_trk",
      "ev_gm_003_rto",
    ]);
    expect(a.refunds).toMatchObject({ issuedTotal: 50_000, coverage: "partial" });
  });

  it("keeps expectedAction out of the evidence assessment", () => {
    for (let i = 0; i < garvitCases.length; i++) {
      expect(Object.keys(assessed(i))).not.toContain("expectedAction");
      expect(Object.keys(garvitCases[i].dispute)).not.toContain("expectedAction");
    }
  });
});
