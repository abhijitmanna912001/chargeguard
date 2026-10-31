import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { ActionLogEntrySchema, FlagSchema, RecommendationSchema, type Flag, type ModelOutput } from "../contracts";
import { createMockCallSarvam, runAgent, type MockReply, type StructuredCallSarvam } from "../agent-core";
import { ModelError, type StructuredRequest } from "../agent-core/model";
import { cases } from "../fixtures/cases";
import { garvitCases } from "../fixtures/garvit-cases";

// Cross-module check: every shared synthetic fixture through the real
// runAgent orchestration (evidence assessment, rules, logging) with a mocked
// model. It lives here because agent-core/ may import contracts/ only.

const all = [...cases, ...garvitCases];
const NOW = "2026-11-05T10:00:00.000Z";

/** What the evidence module and rules add for each fixture; the model adds nothing. */
const EXPECTED_FLAGS: Record<string, Flag[]> = {
  disp_demo_001: [],
  disp_demo_002: ["amount_over_limit"],
  dsp_gm_001: [],
  dsp_gm_002: [],
  dsp_gm_003: ["contradictory_records", "refund_issued"],
};

function recordingModel(reply: MockReply) {
  const inner = createMockCallSarvam(reply);
  const requests: StructuredRequest<z.ZodType>[] = [];
  const call: StructuredCallSarvam = (request, options) => {
    requests.push(request);
    return inner(request, options);
  };
  return { call, requests };
}

function deps(callSarvam: StructuredCallSarvam) {
  let n = 0;
  return { callSarvam, now: () => new Date(NOW), createId: () => `id${++n}` };
}

function expectContractValid(result: Awaited<ReturnType<typeof runAgent>>, disputeId: string) {
  expect(RecommendationSchema.safeParse(result.recommendation).success).toBe(true);
  expect(result.actionLog.length).toBeGreaterThan(0);
  for (const entry of result.actionLog) {
    expect(ActionLogEntrySchema.safeParse(entry).success).toBe(true);
    expect(entry.disputeId).toBe(disputeId);
  }
}

// The mocked model is the only model. Any attempt to reach a provider fails.
const networkGuard = vi.fn<typeof fetch>(async () => {
  throw new Error("network access is not allowed in this test");
});

beforeEach(() => {
  networkGuard.mockClear();
  vi.stubGlobal("fetch", networkGuard);
  vi.stubEnv("SARVAM_API_KEY", "");
});

afterEach(() => {
  expect(networkGuard).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("runAgent over the shared fixtures", () => {
  it("covers all five fixtures, with a clock before every deadline", () => {
    expect(all.map((c) => c.dispute.id).sort()).toEqual(Object.keys(EXPECTED_FLAGS).sort());
    for (const { dispute } of all) expect(Date.parse(dispute.deadline)).toBeGreaterThan(Date.parse(NOW));
  });

  for (const { dispute, expectedAction } of all) {
    describe(`${dispute.id} (${expectedAction})`, () => {
      const modelOutput: ModelOutput = {
        action: expectedAction,
        confidence: 0.9,
        reasoning: `Synthetic mock recommendation: ${expectedAction}.`,
        // Ids of this dispute's own records, so they are trusted evidence.
        evidenceRefs: dispute.evidence.filter((e) => e.type !== "customer_message").map((e) => e.id),
      };

      it("reaches the expected final action through the real orchestration", async () => {
        const model = recordingModel(modelOutput);
        const result = await runAgent(dispute, deps(model.call));

        expectContractValid(result, dispute.id);
        expect(result.recommendation.finalAction).toBe(expectedAction);
        expect(result.recommendation.modelOutput).toEqual(modelOutput);
        expect(result.recommendation.overrideReason).toBeUndefined();
        expect(result.recommendation.flags).toEqual(EXPECTED_FLAGS[dispute.id]);

        // The mock was the model: called once, with this dispute's context.
        expect(model.requests).toHaveLength(1);
        expect(JSON.parse(model.requests[0].messages[0].content!).dispute.id).toBe(dispute.id);
        expect(result.actionLog.map((e) => e.outcome)).toContain(`model_recommended_${expectedAction}`);
      });
    });
  }
});

describe("runAgent over the shared fixtures when the model fails", () => {
  const failures: [string, MockReply][] = [
    ["provider error", new ModelError("provider_error", "Sarvam server error (HTTP 500)", { status: 500, attemptCount: 3 })],
    [
      "malformed output",
      { action: "win", confidence: 0.9, reasoning: "PARTIAL-MODEL-OUTPUT", evidenceRefs: [] } as unknown as ModelOutput,
    ],
  ];

  for (const [label, reply] of failures) {
    for (const { dispute } of all) {
      it(`${label}: ${dispute.id} escalates with model_failure and no model output`, async () => {
        const model = recordingModel(reply);
        const result = await runAgent(dispute, deps(model.call));

        expectContractValid(result, dispute.id);
        expect(model.requests).toHaveLength(1);
        expect(result.recommendation.finalAction).toBe("escalate");
        expect(result.recommendation.modelOutput).toBeNull();
        expect(result.recommendation.flags).toContain("model_failure");
        // Evidence and rule flags are kept alongside model_failure.
        const expected = new Set<Flag>([...EXPECTED_FLAGS[dispute.id], "model_failure"]);
        expect(result.recommendation.flags).toEqual(FlagSchema.options.filter((f) => expected.has(f)));
        expect(JSON.stringify(result)).not.toContain("PARTIAL-MODEL-OUTPUT");
        expect(result.actionLog.map((e) => e.outcome).some((o) => o.startsWith("model_failure:"))).toBe(true);
      });
    }
  }
});
