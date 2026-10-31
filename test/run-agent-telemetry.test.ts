// Cross-module on purpose (agent-core + lib/services), so it lives in test/.
// The database layer is mocked: this checks the handoff, not persistence.
// The model is ALWAYS createMockCallSarvam; fetch is blocked.
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createMockCallSarvam, runAgent, type ModelCallMetadata, type MockReply } from "../agent-core";
import { ModelError } from "../agent-core/model";
import type { ApprovalRequest, Dispute, ModelOutput } from "../contracts";
import { cases } from "../fixtures/cases";
import type { SaveAgentRunInput } from "../lib/services/save-agent-run";
import {
  runAgentForDispute,
  type AgentRunOutput,
  type ModelCallTelemetry,
  type RunAgentDeps,
} from "../lib/services/run-agent-workflow";

vi.mock("../lib/db/repositories/disputes", () => ({ getDispute: vi.fn() }));
vi.mock("../lib/services/save-agent-run", () => ({ saveAgentRun: vi.fn() }));

const { getDispute } = await import("../lib/db/repositories/disputes");
const { saveAgentRun } = await import("../lib/services/save-agent-run");

const NOW = "2026-11-05T10:00:00.000Z";
const dispute: Dispute = cases[0].dispute; // disp_demo_001, status received

const defend: ModelOutput = {
  action: "defend",
  confidence: 0.9,
  reasoning: "Synthetic mock recommendation.",
  evidenceRefs: ["ev_demo_001_txn", "ev_demo_001_delivery"],
};

const networkGuard = vi.fn<typeof fetch>(async () => {
  throw new Error("network access is not allowed in this test");
});

function workflowDeps(runner?: RunAgentDeps["runAgent"]): RunAgentDeps {
  let n = 0;
  return { now: () => new Date(NOW), createId: () => `id${++n}`, runAgent: runner };
}

/** The real runAgent with a mocked model, wired the way app/agent-mode.ts wires it. */
const realAgent =
  (reply: MockReply): RunAgentDeps["runAgent"] =>
  (d, deps) =>
    runAgent(d, { callSarvam: createMockCallSarvam(reply), now: deps.now, createId: deps.createId });

beforeEach(() => {
  vi.stubGlobal("fetch", networkGuard);
  vi.mocked(getDispute).mockResolvedValue(dispute);
  // Echo what would be saved, as the real saveAgentRun returns the stored rows.
  vi.mocked(saveAgentRun).mockImplementation(async (input: SaveAgentRunInput) => ({
    recommendation: input.recommendation,
    actionLog: input.actionLog,
    approval: { id: input.approval.id } as ApprovalRequest,
  }));
});

afterEach(() => {
  expect(networkGuard).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function savedInput(): SaveAgentRunInput {
  expect(saveAgentRun).toHaveBeenCalledTimes(1);
  return vi.mocked(saveAgentRun).mock.calls[0][0];
}

/** Nothing telemetry-shaped is passed to persistence. */
function expectNothingPersisted(input: SaveAgentRunInput) {
  expect(Object.keys(input).sort()).toEqual(["actionLog", "approval", "disputeId", "recommendation"]);
  expect(JSON.stringify(input)).not.toMatch(/modelCallMetadata|attemptCount|latencyMs|totalTokens/);
}

describe("model-call telemetry through runAgentForDispute", () => {
  it("agent-core's ModelCallMetadata fits the service's ModelCallTelemetry", () => {
    expectTypeOf<ModelCallMetadata>().toExtend<ModelCallTelemetry>();
    expectTypeOf<Awaited<ReturnType<typeof runAgent>>>().toExtend<AgentRunOutput>();
  });

  it("success: metadata survives the handoff and is not saved", async () => {
    const result = await runAgentForDispute(dispute.id, workflowDeps(realAgent(defend)));
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.recommendation.finalAction).toBe("defend");
    expect(result.modelCallMetadata).toEqual({
      status: "succeeded",
      attemptCount: 1,
      latencyMs: 0,
      totalTokens: 0,
      providerRequestId: "mock-chatcmpl-1",
      model: "sarvam-105b",
      finishReason: "stop",
    });
    expectNothingPersisted(savedInput());
  });

  it("model failure: escalation is saved unchanged, failure telemetry reaches the caller", async () => {
    const error = new ModelError("timeout", "No response from Sarvam within 12000ms", {
      retryable: true,
      attemptCount: 2,
      latencyMs: 24_500,
    });
    const result = await runAgentForDispute(dispute.id, workflowDeps(realAgent(error)));
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    const input = savedInput();
    expect(input.recommendation).toMatchObject({ modelOutput: null, finalAction: "escalate", flags: ["model_failure"] });
    expect(result.modelCallMetadata).toEqual({
      status: "failed",
      failureKind: "timeout",
      attemptCount: 2,
      latencyMs: 24_500,
      totalTokens: null,
    });
    expectNothingPersisted(input);
  });

  it("mock mode (no runner): unchanged save, null metadata", async () => {
    const result = await runAgentForDispute(dispute.id, workflowDeps());
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.modelCallMetadata).toBeNull();
    expectNothingPersisted(savedInput());
  });

  it("a runner on the old shape (no metadata field) still works, with null metadata", async () => {
    const oldShape: RunAgentDeps["runAgent"] = async (d, deps) => {
      const { recommendation, actionLog } = await realAgent(defend)!(d, deps);
      return { recommendation, actionLog };
    };
    const result = await runAgentForDispute(dispute.id, workflowDeps(oldShape));
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.modelCallMetadata).toBeNull();
  });

  it("not_found and not_ready results are unchanged", async () => {
    vi.mocked(getDispute).mockResolvedValueOnce(null);
    expect(await runAgentForDispute("nope", workflowDeps(realAgent(defend)))).toEqual({ ok: false, reason: "not_found" });
    vi.mocked(getDispute).mockResolvedValueOnce({ ...dispute, status: "submitted" });
    expect(await runAgentForDispute(dispute.id, workflowDeps(realAgent(defend)))).toEqual({ ok: false, reason: "not_ready" });
    expect(saveAgentRun).not.toHaveBeenCalled();
  });
});
