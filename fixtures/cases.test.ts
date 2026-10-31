import { describe, expect, it } from "vitest";
import { cases } from "./cases";

const CUTOFF = Date.parse("2026-10-30T23:59:59.000Z");
const t = (iso: string | undefined) => Date.parse(iso as string);

describe("demo case dates", () => {
  it.each(cases.map((c) => [c.dispute.id, c.dispute] as const))("%s: nothing is collected or sent after the cutoff", (_id, d) => {
    for (const e of d.evidence) {
      expect(t(e.collectedAt), e.id).toBeLessThanOrEqual(CUTOFF);
      if (e.type === "customer_message") expect(t(e.sentAt), e.id).toBeLessThanOrEqual(CUTOFF);
    }
    expect(t(d.createdAt)).toBeLessThanOrEqual(CUTOFF);
  });

  it.each(cases.map((c) => [c.dispute.id, c.dispute] as const))(
    "%s: transaction, then settlement, then delivery, then message, then the dispute, then collection",
    (_id, d) => {
      const txn = d.evidence.find((e) => e.type === "transaction");
      const stl = d.evidence.find((e) => e.type === "settlement");
      const del = d.evidence.find((e) => e.type === "delivery_proof");
      const msg = d.evidence.find((e) => e.type === "customer_message");
      if (txn?.type !== "transaction" || stl?.type !== "settlement" || del?.type !== "delivery_proof" || msg?.type !== "customer_message") {
        throw new Error("fixture is missing an evidence type");
      }
      const chain = [txn.occurredAt, stl.settledAt, del.deliveredAt, msg.sentAt].filter((x): x is string => x !== undefined);
      for (let i = 1; i < chain.length; i++) expect(t(chain[i])).toBeGreaterThan(t(chain[i - 1]));
      expect(t(d.createdAt)).toBeGreaterThan(t(msg.sentAt));
      for (const e of d.evidence) expect(t(e.collectedAt), e.id).toBeGreaterThan(t(d.createdAt));
      expect(t(d.deadline)).toBeGreaterThan(t(d.createdAt));
    },
  );
});
