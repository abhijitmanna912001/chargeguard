import { describe, expect, it } from "vitest";
import { BLOCKING_FLAGS, RecommendationSchema, type Action, type Flag, type ModelOutput } from "../../contracts";
import {
  AMOUNT_ESCALATION_THRESHOLD_PAISE,
  checkDeadline,
  decideFinalAction,
  DEADLINE_RISK_WINDOW_MS,
  isLowConfidence,
  isOverAmountLimit,
  LOW_CONFIDENCE_THRESHOLD,
  RULE_IDS,
} from "../decision-policy";

// Pure policy functions. No clock, no model, no database.

const NOW_MS = Date.parse("2026-11-05T10:00:00.000Z");
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(NOW_MS + offsetMs).toISOString();

const model = (action: Action, confidence = 0.9): ModelOutput => ({
  action,
  confidence,
  reasoning: "synthetic",
  evidenceRefs: [],
});

/** The decision must always produce a Recommendation the contract accepts. */
function assertContractValid(modelOutput: ModelOutput | null, flags: Flag[]) {
  const d = decideFinalAction(modelOutput, flags);
  const parsed = RecommendationSchema.safeParse({
    id: "rec_1",
    disputeId: "d1",
    createdAt: at(0),
    modelOutput,
    finalAction: d.finalAction,
    ...(d.overrideReason ? { overrideReason: d.overrideReason } : {}),
    flags,
  });
  expect(parsed.success).toBe(true);
  return d;
}

describe("policy constants", () => {
  it("match the confirmed synthetic demo values", () => {
    expect(AMOUNT_ESCALATION_THRESHOLD_PAISE).toBe(1_000_000);
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.7);
    expect(DEADLINE_RISK_WINDOW_MS).toBe(48 * HOUR);
  });
});

describe("isOverAmountLimit", () => {
  it("is false at exactly 1,000,000 paise and true one paisa above", () => {
    expect(isOverAmountLimit(999_999)).toBe(false);
    expect(isOverAmountLimit(1_000_000)).toBe(false);
    expect(isOverAmountLimit(1_000_001)).toBe(true);
  });
});

describe("isLowConfidence", () => {
  it("is false at exactly 0.7 and true just below", () => {
    expect(isLowConfidence(0.7)).toBe(false);
    expect(isLowConfidence(0.69999)).toBe(true);
    expect(isLowConfidence(0)).toBe(true);
    expect(isLowConfidence(1)).toBe(false);
  });
});

describe("checkDeadline", () => {
  it("is ok at exactly 48 hours remaining", () => {
    expect(checkDeadline(at(48 * HOUR), NOW_MS)).toEqual({ status: "ok", remainingMs: 48 * HOUR });
  });

  it("is at risk 1 ms inside the 48 hour window", () => {
    expect(checkDeadline(at(48 * HOUR - 1), NOW_MS).flag).toBe("deadline_at_risk");
  });

  it("is at risk with under 24 hours remaining", () => {
    expect(checkDeadline(at(23 * HOUR), NOW_MS)).toMatchObject({ status: "at_risk", flag: "deadline_at_risk" });
  });

  it("is expired when the deadline equals now", () => {
    expect(checkDeadline(at(0), NOW_MS)).toMatchObject({ status: "expired", flag: "deadline_expired" });
  });

  it("is expired when the deadline has passed", () => {
    expect(checkDeadline(at(-HOUR), NOW_MS)).toMatchObject({ status: "expired", flag: "deadline_expired" });
  });

  it("compares instants, not strings", () => {
    expect(checkDeadline("2026-11-07T10:00:00Z", NOW_MS).status).toBe("ok");
    expect(checkDeadline("2026-11-07T09:59:59.999Z", NOW_MS).status).toBe("at_risk");
  });
});

describe("decideFinalAction priority", () => {
  it("1. escalates without overrideReason when there is no model output", () => {
    const d = assertContractValid(null, ["model_failure"]);
    expect(d).toMatchObject({ finalAction: "escalate", ruleId: RULE_IDS.modelFailure });
    expect(d.overrideReason).toBeUndefined();
  });

  it("2. amount_over_limit overrides defend and accept", () => {
    for (const action of ["defend", "accept"] as const) {
      const d = assertContractValid(model(action), ["amount_over_limit"]);
      expect(d).toMatchObject({ finalAction: "escalate", ruleId: RULE_IDS.amountLimit });
      expect(d.overrideReason).toMatch(/1000000 paise/);
    }
  });

  it("2 before 3: amount wins over low confidence", () => {
    expect(decideFinalAction(model("defend", 0.2), ["amount_over_limit", "low_confidence"]).ruleId).toBe(
      RULE_IDS.amountLimit,
    );
  });

  it("3. low_confidence overrides defend and accept", () => {
    for (const action of ["defend", "accept"] as const) {
      const d = assertContractValid(model(action, 0.5), ["low_confidence"]);
      expect(d).toMatchObject({ finalAction: "escalate", ruleId: RULE_IDS.lowConfidence });
      expect(d.overrideReason).toMatch(/0\.7/);
    }
  });

  it("4. model escalate stays escalate with no overrideReason, even under a rule", () => {
    for (const flags of [[], ["amount_over_limit"], ["missing_evidence"]] as Flag[][]) {
      const d = assertContractValid(model("escalate"), flags);
      expect(d.finalAction).toBe("escalate");
      expect(d.overrideReason).toBeUndefined();
    }
  });

  it("5. model accept stays accept, including with blocking evidence flags", () => {
    const d = assertContractValid(model("accept"), ["missing_evidence", "deadline_expired", "refund_issued"]);
    expect(d).toEqual({ finalAction: "accept", ruleId: RULE_IDS.modelRecommendation, reason: "Model recommended accepting" });
  });

  it("6. every blocking flag on its own turns defend into escalate", () => {
    const evidenceBlocking = BLOCKING_FLAGS.filter(
      (f) => !["amount_over_limit", "low_confidence", "model_failure"].includes(f),
    );
    for (const flag of evidenceBlocking) {
      const d = assertContractValid(model("defend"), [flag]);
      expect(d).toMatchObject({ finalAction: "escalate", ruleId: RULE_IDS.blockingFlags });
      expect(d.overrideReason).toContain(flag);
    }
  });

  it("6. deadline_at_risk and refund_issued do not block defend", () => {
    const d = assertContractValid(model("defend"), ["deadline_at_risk", "refund_issued"]);
    expect(d.finalAction).toBe("defend");
    expect(d.overrideReason).toBeUndefined();
  });

  it("never turns a recommendation into accept", () => {
    const all = BLOCKING_FLAGS.slice();
    for (const action of ["defend", "escalate"] as const) {
      expect(decideFinalAction(model(action), all).finalAction).toBe("escalate");
    }
  });
});
