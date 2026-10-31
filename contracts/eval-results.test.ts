import { describe, expect, it } from "vitest";
import { EvalCaseResultSchema, EvalResultsSchema, type EvalCaseResult, type EvalResults } from "./index";

const goodCase = (over: Partial<EvalCaseResult> = {}): EvalCaseResult => ({
  disputeId: "dsp_1",
  expectedAction: "defend",
  finalAction: "defend",
  modelAction: "defend",
  correct: true,
  confidence: 0.9,
  flags: [],
  evidenceRequirementsMet: 3,
  evidenceRequirementsTotal: 3,
  latencyMs: 1200,
  attemptCount: 1,
  totalTokens: 800,
  modelFailure: false,
  ...over,
});

const badCase = goodCase({
  disputeId: "dsp_2",
  expectedAction: "accept",
  finalAction: "escalate",
  modelAction: null,
  correct: false,
  confidence: null,
  flags: ["model_failure"],
  evidenceRequirementsMet: 1,
  latencyMs: 3000,
  attemptCount: 2,
  totalTokens: null,
  modelFailure: true,
});

const results = (over: Partial<EvalResults> = {}): EvalResults => ({
  generatedAt: "2026-11-02T04:30:00.000Z",
  model: "sarvam-m",
  agentMode: "live",
  cases: [goodCase(), badCase],
  summary: { total: 2, correct: 1, accuracy: 0.5, modelFailures: 1, medianLatencyMs: 2100, maxLatencyMs: 3000 },
  ...over,
});

const issuePaths = (value: unknown) => {
  const r = EvalResultsSchema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("EvalResultsSchema", () => {
  it("accepts consistent data with a correct and an incorrect case", () => {
    expect(EvalResultsSchema.safeParse(results()).success).toBe(true);
  });

  it("rejects an empty case list", () => {
    expect(EvalResultsSchema.safeParse(results({ cases: [] as never })).success).toBe(false);
  });

  it("rejects agentMode other than live", () => {
    expect(EvalResultsSchema.safeParse({ ...results(), agentMode: "mock" }).success).toBe(false);
  });

  it("rejects missing fields, extra fields and out-of-range values", () => {
    const noModel: Record<string, unknown> = { ...results() };
    delete noModel.model;
    expect(EvalResultsSchema.safeParse(noModel).success).toBe(false);
    expect(EvalResultsSchema.safeParse({ ...results(), extra: 1 }).success).toBe(false);
    expect(EvalCaseResultSchema.safeParse(goodCase({ confidence: 1.5 })).success).toBe(false);
    expect(EvalCaseResultSchema.safeParse(goodCase({ attemptCount: 0 })).success).toBe(false);
    expect(EvalCaseResultSchema.safeParse(goodCase({ latencyMs: -1 })).success).toBe(false);
    expect(EvalCaseResultSchema.safeParse(goodCase({ latencyMs: 1.5 })).success).toBe(false);
    expect(EvalCaseResultSchema.safeParse(goodCase({ totalTokens: -3 })).success).toBe(false);
    expect(EvalCaseResultSchema.safeParse(goodCase({ expectedAction: "refund" as never })).success).toBe(false);
    expect(EvalResultsSchema.safeParse({ ...results(), generatedAt: "yesterday" }).success).toBe(false);
  });

  it("rejects evidenceRequirementsMet above the total", () => {
    const r = EvalCaseResultSchema.safeParse(goodCase({ evidenceRequirementsMet: 4 }));
    expect(r.success).toBe(false);
  });

  it("rejects a correct flag that disagrees with the actions", () => {
    expect(EvalCaseResultSchema.safeParse(goodCase({ correct: false })).success).toBe(false);
    expect(EvalCaseResultSchema.safeParse(badCase).success).toBe(true);
    expect(EvalCaseResultSchema.safeParse({ ...badCase, correct: true }).success).toBe(false);
  });

  it("rejects summary counts that do not match the cases", () => {
    const base = results();
    expect(issuePaths({ ...base, summary: { ...base.summary, total: 3 } })).toContain("summary.total");
    expect(issuePaths({ ...base, summary: { ...base.summary, correct: 2 } })).toContain("summary.correct");
    expect(issuePaths({ ...base, summary: { ...base.summary, accuracy: 1 } })).toContain("summary.accuracy");
    expect(issuePaths({ ...base, summary: { ...base.summary, modelFailures: 0 } })).toContain("summary.modelFailures");
    expect(issuePaths({ ...base, summary: { ...base.summary, maxLatencyMs: 9999 } })).toContain("summary.maxLatencyMs");
    expect(issuePaths({ ...base, summary: { ...base.summary, medianLatencyMs: 5 } })).toContain("summary.medianLatencyMs");
  });

  it("accepts accuracy stored rounded to two decimals", () => {
    const three = [goodCase(), goodCase({ disputeId: "a" }), badCase];
    const r = results({
      cases: three as never,
      summary: { total: 3, correct: 2, accuracy: 0.67, modelFailures: 1, medianLatencyMs: 1200, maxLatencyMs: 3000 },
    });
    expect(EvalResultsSchema.safeParse(r).success).toBe(true);
  });
});
