import { describe, expect, it } from "vitest";
import { cases } from "@/fixtures/cases";
import { evidenceStatus } from "./evidence-status";

describe("evidenceStatus", () => {
  const all = cases.flatMap((c) => c.dispute.evidence);
  it("returns a label for every evidence type except customer messages", () => {
    for (const e of all) {
      const s = evidenceStatus(e);
      if (e.type === "customer_message") expect(s).toBeNull();
      else expect(s?.label).toBeTruthy();
    }
  });
  it("treats a delivered proof as success and a failed transaction as danger", () => {
    const delivered = all.find((e) => e.type === "delivery_proof" && e.status === "delivered");
    if (delivered) expect(evidenceStatus(delivered)?.tone).toBe("success");
    const failed = all.find((e) => e.type === "transaction" && e.status === "failed");
    if (failed) expect(evidenceStatus(failed)?.tone).toBe("danger");
  });
});
