import { describe, expect, it } from "vitest";
import {
  actionLogFromRow,
  actionLogToCreateData,
  disputeFromRow,
  disputeToWriteData,
  type DisputeRowWithEvidence,
} from "./mappers";
import { cases } from "../../fixtures/cases";
import { MAX_PAISE, type ActionLogEntry, type Dispute } from "../../contracts";

const D = new Date("2026-01-01T10:30:00.000Z");

function disputeRow(
  overrides: Partial<DisputeRowWithEvidence> = {},
): DisputeRowWithEvidence {
  return {
    id: "d1",
    transactionId: "t1",
    amount: 49900,
    reasonCode: "4853",
    deadline: new Date("2026-02-01T00:00:00.000Z"),
    createdAt: D,
    status: "received",
    evidence: [
      {
        id: "e1",
        disputeId: "d1",
        type: "refund",
        collectedAt: D,
        payload: { amount: 100, status: "issued", issuedAt: "2026-01-01T09:00:00.000Z" },
      },
    ],
    ...overrides,
  };
}

describe("disputeFromRow", () => {
  it("maps a valid row with ISO Z timestamps and rebuilt evidence", () => {
    const dispute = disputeFromRow(disputeRow());
    expect(dispute.deadline).toBe("2026-02-01T00:00:00.000Z");
    expect(dispute.createdAt).toBe("2026-01-01T10:30:00.000Z");
    expect(dispute.amount).toBe(49900);
    expect(dispute.evidence).toEqual([
      {
        id: "e1",
        disputeId: "d1",
        type: "refund",
        collectedAt: "2026-01-01T10:30:00.000Z",
        amount: 100,
        status: "issued",
        issuedAt: "2026-01-01T09:00:00.000Z",
      },
    ]);
  });

  it("throws on an invalid status", () => {
    expect(() => disputeFromRow(disputeRow({ status: "won" }))).toThrow();
  });

  it("throws when amount is above the paise cap", () => {
    expect(() => disputeFromRow(disputeRow({ amount: MAX_PAISE + 1 }))).toThrow();
  });

  it("throws when evidence payload breaks its variant rules", () => {
    const bad = disputeRow({
      evidence: [
        { id: "e1", disputeId: "d1", type: "refund", collectedAt: D, payload: { amount: 100, status: "issued" } },
      ],
    });
    expect(() => disputeFromRow(bad)).toThrow();
  });

  it("throws when evidence payload is not an object", () => {
    const bad = disputeRow({
      evidence: [{ id: "e1", disputeId: "d1", type: "refund", collectedAt: D, payload: "oops" }],
    });
    expect(() => disputeFromRow(bad)).toThrow();
  });
});

const logRow = {
  seq: 1, // DB insertion order; the mapper ignores it

  id: "l1",
  disputeId: "d1",
  timestamp: D,
  step: "decide",
  actor: "rule",
  summary: "Escalated: amount over limit",
  evidenceRefs: ["e1"],
  confidence: null,
  ruleId: null,
  outcome: "escalate",
};

describe("actionLogFromRow", () => {
  it("maps a row, turning null optionals into absent fields", () => {
    const entry = actionLogFromRow(logRow);
    expect(entry.timestamp).toBe("2026-01-01T10:30:00.000Z");
    expect(entry.confidence).toBeUndefined();
    expect(entry.ruleId).toBeUndefined();
  });

  it("throws on an invalid step", () => {
    expect(() => actionLogFromRow({ ...logRow, step: "guess" })).toThrow();
  });
});

describe("actionLogToCreateData", () => {
  const entry: ActionLogEntry = {
    id: "l1",
    disputeId: "d1",
    timestamp: "2026-01-01T10:30:00.000Z",
    step: "decide",
    actor: "rule",
    summary: "Escalated",
    evidenceRefs: [],
    ruleId: "over-limit",
    outcome: "escalate",
  };

  it("converts the timestamp to a Date", () => {
    const data = actionLogToCreateData(entry);
    expect(data.timestamp).toEqual(D);
    expect(data.ruleId).toBe("over-limit");
  });

  it("validates the entry before building data", () => {
    expect(() =>
      actionLogToCreateData({ ...entry, confidence: 1.5 }),
    ).toThrow();
  });
});

// contract -> write data -> row-shaped object (as the DB would return it,
// payload passed through JSON) -> contract.
function viaFakeDb(dispute: Dispute): Dispute {
  const { id, fields, evidence } = disputeToWriteData(dispute);
  return disputeFromRow({
    id,
    ...fields,
    evidence: evidence.map((e) => ({
      id: e.id,
      ...e.fields,
      payload: JSON.parse(JSON.stringify(e.fields.payload)),
    })),
  });
}

describe("disputeToWriteData round trip", () => {
  it.each(cases.map((c) => [c.dispute.id, c.dispute] as const))(
    "fixture %s survives the round trip unchanged",
    (_id, dispute) => {
      expect(viaFakeDb(dispute)).toEqual(dispute);
    },
  );

  it("keeps only non-column fields in the evidence payload", () => {
    const { evidence } = disputeToWriteData(cases[0].dispute);
    const delivery = evidence.find((e) => e.fields.type === "delivery_proof");
    expect(delivery?.fields.payload).toEqual({
      kind: "courier_tracking",
      status: "delivered",
      deliveredAt: "2026-10-24T11:40:00.000Z",
      reference: "AWB-DEMO-100245",
    });
    expect(delivery?.fields.collectedAt).toBeInstanceOf(Date);
  });

  it("rejects an invalid dispute", () => {
    expect(() =>
      disputeToWriteData({ ...cases[0].dispute, amount: MAX_PAISE + 1 }),
    ).toThrow();
  });

  it("rejects evidence that belongs to another dispute", () => {
    const d = cases[0].dispute;
    const stray = { ...d.evidence[0], disputeId: "other" };
    expect(() =>
      disputeToWriteData({ ...d, evidence: [stray, ...d.evidence.slice(1)] }),
    ).toThrow(/belongs to dispute/);
  });
});
