import { describe, expect, it } from "vitest";
import {
  actionLogFromRow,
  actionLogToCreateData,
  disputeFromRow,
  type DisputeRowWithEvidence,
} from "./mappers";
import { MAX_PAISE, type ActionLogEntry } from "../../contracts";

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
