import { describe, expect, it } from "vitest";
import { cases } from "../fixtures/cases";
import { evidenceTypeLabel, groupEvidenceByType } from "./evidence-display";

const evidence = cases[0].dispute.evidence;

describe("evidenceTypeLabel", () => {
  it("returns a human label for each type", () => {
    expect(evidenceTypeLabel("transaction")).toBe("Transaction");
    expect(evidenceTypeLabel("delivery_proof")).toBe("Delivery proof");
    expect(evidenceTypeLabel("customer_message")).toBe("Customer message");
    expect(evidenceTypeLabel("settlement")).toBe("Settlement");
    expect(evidenceTypeLabel("refund")).toBe("Refund");
  });
});

describe("groupEvidenceByType", () => {
  it("groups in display order regardless of input order", () => {
    const groups = groupEvidenceByType([...evidence].reverse());
    expect(groups.map((g) => g.type)).toEqual([
      "transaction",
      "settlement",
      "delivery_proof",
      "customer_message",
    ]);
  });
  it("skips types with no evidence", () => {
    expect(groupEvidenceByType(evidence).some((g) => g.type === "refund")).toBe(false);
    expect(groupEvidenceByType([])).toEqual([]);
  });
  it("keeps several items of one type together", () => {
    const extra = { ...evidence[0], id: "ev_extra" };
    const group = groupEvidenceByType([...evidence, extra]).find((g) => g.type === "transaction");
    expect(group?.items.map((i) => i.id)).toEqual(["ev_demo_001_txn", "ev_extra"]);
  });
  it("covers every evidence in the input", () => {
    const total = groupEvidenceByType(evidence).reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(evidence.length);
  });
});
