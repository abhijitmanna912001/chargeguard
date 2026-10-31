import { describe, expect, it } from "vitest";
import { cases } from "../../fixtures/cases";
import type { Recommendation } from "../../contracts";
import { buildDefensePackage } from "./defense-package";

const [defendCase, escalateCase] = cases;

const rec = (disputeId: string, over: Partial<Recommendation> = {}): Recommendation => ({
  id: "rec_1",
  disputeId,
  createdAt: "2026-10-26T00:00:00.000Z",
  modelOutput: { action: "defend", confidence: 0.9, reasoning: "ok", evidenceRefs: [] },
  finalAction: "defend",
  flags: [],
  ...over,
});

describe("buildDefensePackage", () => {
  it("builds the summary from the delivered fixture's facts", () => {
    const pkg = buildDefensePackage(defendCase.dispute, rec(defendCase.dispute.id));
    expect(pkg).toEqual({
      disputeId: "disp_demo_001",
      reasonCode: "13.1",
      amountPaise: 249900,
      summary:
        'Defense for dispute disp_demo_001, reason code 13.1, amount ₹2,499.00. ' +
        "Delivery proof AWB-DEMO-100245 shows delivery on 2026-10-24. " +
        "Settlement stl_demo_001 was settled on 2026-10-22. " +
        'The customer\'s message was sent in language "hi".',
      // No cited refs, so it falls back to the evidence behind the summary.
      evidenceRefs: ["ev_demo_001_delivery", "ev_demo_001_settle", "ev_demo_001_msg"],
    });
  });

  it("states non-delivered status plainly for the in-transit fixture", () => {
    const pkg = buildDefensePackage(escalateCase.dispute, rec(escalateCase.dispute.id));
    expect(pkg.summary).toContain("Delivery proof AWB-DEMO-200981 has status in_transit.");
    expect(pkg.summary).toContain('language "en"');
    expect(pkg.amountPaise).toBe(4500000);
  });

  it("uses the evidence the recommendation cited and drops unknown ids", () => {
    const pkg = buildDefensePackage(
      defendCase.dispute,
      rec(defendCase.dispute.id, {
        modelOutput: {
          action: "defend",
          confidence: 0.9,
          reasoning: "ok",
          evidenceRefs: ["ev_demo_001_txn", "ev_missing"],
        },
      }),
    );
    expect(pkg.evidenceRefs).toEqual(["ev_demo_001_txn"]);
  });

  it("is deterministic and handles missing evidence", () => {
    const bare = { ...defendCase.dispute, evidence: [] };
    const a = buildDefensePackage(bare, rec(bare.id));
    expect(a).toEqual(buildDefensePackage(bare, rec(bare.id)));
    expect(a.summary).toContain("No delivery proof is on file.");
    expect(a.evidenceRefs).toEqual([]);
  });

  it("rejects a recommendation from another dispute", () => {
    expect(() => buildDefensePackage(defendCase.dispute, rec("other"))).toThrow(/does not belong/);
  });
});
