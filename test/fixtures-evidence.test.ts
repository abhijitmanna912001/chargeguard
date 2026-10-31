import { describe, expect, it } from "vitest";
import { assessEvidence, DEFAULT_EVIDENCE_POLICIES, type EvidenceAssessment, type EvidencePolicyRegistry } from "../agent-core/evidence";
import { cases } from "../fixtures/cases";
import { garvitCases } from "../fixtures/garvit-cases";

// Cross-module check: how the evidence module reads both fixture collections.
// It lives here because fixtures/ and agent-core/ may each import contracts/
// only. expectedAction is the full pipeline's target; the evidence module
// produces flags, never an action.

const all = [...cases, ...garvitCases];

function assessed(id: string, policies?: EvidencePolicyRegistry): EvidenceAssessment {
  const fixture = all.find((c) => c.dispute.id === id);
  if (!fixture) throw new Error(`no fixture ${id}`);
  const result = assessEvidence(fixture.dispute, policies ? { policies } : undefined);
  if (!result.ok) throw new Error(`fixture ${id} failed dispute validation`);
  return result;
}

describe("evidence assessment of every fixture", () => {
  it.each(all.map((c) => c.dispute.id))("%s is fully trusted under a supported policy", (id) => {
    const a = assessed(id);
    expect(a.flags).not.toContain("unsupported_reason_code");
    expect(a.evidenceCompleteness.complete).toBe(true);
    expect(a.invalidEvidence).toEqual([]);
    expect(a.excludedEvidence).toEqual([]);
    expect(a.disputeId).toBe(id);
    expect(a.trustedEvidence).toEqual(a.parsedEvidence);
    expect(Object.keys(a)).not.toContain("expectedAction");
  });
});

describe("main fixtures (reason code 13.1)", () => {
  it("use the 13.1 alias and are not unsupported", () => {
    for (const { dispute } of cases) {
      expect(dispute.reasonCode).toBe("13.1");
      expect(assessed(dispute.id).evidenceCompleteness.policy).toBe("13.1");
    }
  });

  it("would be unsupported without the alias, so the alias is what fixes it", () => {
    const { ["13.1"]: _alias, ...withoutAlias } = DEFAULT_EVIDENCE_POLICIES;
    expect(_alias).toBeDefined();
    for (const { dispute } of cases) {
      expect(assessed(dispute.id, withoutAlias).flags).toEqual(["unsupported_reason_code"]);
    }
  });

  it("disp_demo_001 (defend): delivered, no evidence flags", () => {
    const a = assessed("disp_demo_001");
    expect(a.flags).toEqual([]);
    expect(a.delivery).toEqual({ statuses: ["delivered"], deliveredRefs: ["ev_demo_001_delivery"] });
  });

  it("disp_demo_002 (escalate): in-transit delivery is present evidence; amount limits are not judged here", () => {
    const a = assessed("disp_demo_002");
    expect(a.flags).toEqual([]);
    expect(a.delivery).toEqual({ statuses: ["in_transit"], deliveredRefs: [] });
    expect(a.issues.find((i) => i.code === "delivery_in_transit")?.evidenceRefs).toEqual(["ev_demo_002_delivery"]);
  });
});

describe("garvit fixtures", () => {
  it("dsp_gm_001 (defend): delivered, no evidence flags", () => {
    const a = assessed("dsp_gm_001");
    expect(a.flags).toEqual([]);
    expect(a.delivery).toEqual({ statuses: ["delivered"], deliveredRefs: ["ev_gm_001_pod"] });
  });

  it("dsp_gm_002 (accept): returned to origin, no refund issued", () => {
    const a = assessed("dsp_gm_002");
    expect(a.flags).toEqual([]);
    expect(a.delivery).toEqual({ statuses: ["in_transit", "returned_to_origin"], deliveredRefs: [] });
    expect(a.refunds.issuedCount).toBe(0);
  });

  it("dsp_gm_003 (escalate): delivery records contradict each other", () => {
    const a = assessed("dsp_gm_003");
    expect(a.flags).toEqual(["contradictory_records", "refund_issued"]);
    expect(a.issues.find((i) => i.code === "delivery_conflict")?.evidenceRefs).toEqual([
      "ev_gm_003_trk",
      "ev_gm_003_rto",
    ]);
    expect(a.refunds).toMatchObject({ issuedTotal: 50_000, coverage: "partial", excess: "none" });
  });
});
