import { describe, expect, it } from "vitest";
import { ActionSchema, DisputeSchema, EvidenceSchema, type Dispute } from "../contracts";
import { cases, type FixtureCase } from "./cases";
import { garvitCases, type GarvitCase } from "./garvit-cases";

// fixtures/ imports contracts/ only (AGENTS.md). How agent-core assesses these
// cases is tested in test/fixtures-evidence.test.ts.

// Compile time: both collections share the { dispute, expectedAction } shape.
const garvitAsFixtureCases: FixtureCase[] = garvitCases;
const casesAsGarvitCases: GarvitCase[] = cases;

const TIME_KEYS = ["deadline", "createdAt", "collectedAt", "occurredAt", "settledAt", "deliveredAt", "issuedAt", "sentAt"];
const all: FixtureCase[] = [...cases, ...garvitAsFixtureCases];

const evidenceIds = (d: Dispute) => d.evidence.map((e) => e.id);
const transactionIds = (d: Dispute) => [
  d.transactionId,
  ...d.evidence.flatMap((e) => (e.type === "transaction" ? [e.transactionId] : [])),
];

describe("garvit fixtures", () => {
  it("has exactly one defend, one accept and one escalate case", () => {
    expect(garvitCases).toHaveLength(3);
    expect(garvitCases.map((c) => ActionSchema.parse(c.expectedAction))).toEqual(["defend", "accept", "escalate"]);
    expect(garvitCases.map((c) => c.dispute.id)).toEqual(["dsp_gm_001", "dsp_gm_002", "dsp_gm_003"]);
  });
});

describe("both fixture collections", () => {
  it("are kept separate and complete", () => {
    expect(casesAsGarvitCases.map((c) => c.dispute.id)).toEqual(["disp_demo_001", "disp_demo_002"]);
    expect(all).toHaveLength(5);
  });

  it.each(all.map((c) => [c.dispute.id, c] as const))("%s passes the contract schemas", (_id, { dispute, expectedAction }) => {
    expect(DisputeSchema.safeParse(dispute).error).toBeUndefined();
    expect(ActionSchema.safeParse(expectedAction).success).toBe(true);
    expect(dispute.evidence.length).toBeGreaterThan(1);
    for (const record of dispute.evidence) {
      expect(EvidenceSchema.safeParse(record).error, record.id).toBeUndefined();
      expect(record.disputeId, record.id).toBe(dispute.id);
      if (record.type === "transaction") expect(record.transactionId).toBe(dispute.transactionId);
    }
    for (const value of [dispute, ...dispute.evidence]) {
      for (const [key, v] of Object.entries(value)) {
        // toISOString() form, so the value survives the database round trip.
        if (TIME_KEYS.includes(key)) expect(new Date(v as string).toISOString(), key).toBe(v);
        if (key === "amount") expect(Number.isSafeInteger(v), key).toBe(true);
      }
    }
  });

  it("share no dispute, evidence or transaction ids", () => {
    const disputeIds = all.map((c) => c.dispute.id);
    const allEvidenceIds = all.flatMap((c) => evidenceIds(c.dispute));
    // Each dispute repeats its own transaction id; collisions are across disputes.
    const txnIds = all.flatMap((c) => [...new Set(transactionIds(c.dispute))]);
    for (const [name, ids] of Object.entries({ disputeIds, allEvidenceIds, txnIds })) {
      expect(ids.length, name).toBe(new Set(ids).size);
    }
  });
});
