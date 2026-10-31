import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionLogEntrySchema, RecommendationSchema, type Dispute } from "../../contracts";
import { decideFinalAction } from "../decision-policy";
import { assessEvidence } from "../evidence";
import { createMockCallSarvam, InvalidDisputeError, runAgent, type StructuredCallSarvam } from "../index";

// Failures that cannot happen with a schema-valid dispute unless a module
// misbehaves. Both modules are passthroughs until a test overrides one call.

vi.mock("../evidence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../evidence")>();
  return { ...actual, assessEvidence: vi.fn(actual.assessEvidence) };
});
vi.mock("../decision-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../decision-policy")>();
  return { ...actual, decideFinalAction: vi.fn(actual.decideFinalAction) };
});

const NOW = "2026-11-05T10:00:00.000Z";

const dispute: Dispute = {
  id: "disp_fail_001",
  transactionId: "txn_fail_001",
  amount: 1_500_000,
  reasonCode: "GOODS_NOT_RECEIVED",
  deadline: "2026-11-20T00:00:00.000Z",
  createdAt: "2026-11-02T04:30:00.000Z",
  status: "received",
  evidence: [
    {
      id: "ev_txn",
      disputeId: "disp_fail_001",
      collectedAt: "2026-11-02T04:31:00.000Z",
      type: "transaction",
      transactionId: "txn_fail_001",
      amount: 1_500_000,
      status: "success",
      occurredAt: "2026-10-20T08:15:00.000Z",
    },
  ],
};

function deps() {
  let n = 0;
  const mock = createMockCallSarvam({ action: "accept", confidence: 0.9, reasoning: "synthetic", evidenceRefs: ["ev_txn"] });
  const calls = { count: 0 };
  // vi.fn would erase the generic call signature, so count by hand.
  const callSarvam: StructuredCallSarvam = (request, options) => {
    calls.count++;
    return mock(request, options);
  };
  return { now: () => new Date(NOW), createId: () => `id${++n}`, callSarvam, calls };
}

function expectSafeEscalation(r: Awaited<ReturnType<typeof runAgent>>) {
  expect(RecommendationSchema.safeParse(r.recommendation).success).toBe(true);
  for (const e of r.actionLog) expect(ActionLogEntrySchema.safeParse(e).success).toBe(true);
  expect(r.recommendation).toMatchObject({ modelOutput: null, finalAction: "escalate" });
  expect(r.recommendation.flags).toContain("model_failure");
  expect(JSON.stringify(r)).not.toMatch(/kaboom/);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("evidence assessment failure", () => {
  it("escalates without calling the model when assessEvidence throws", async () => {
    vi.mocked(assessEvidence).mockImplementationOnce(() => {
      throw new Error("kaboom");
    });
    const d = deps();
    const r = await runAgent(dispute, d);
    expectSafeEscalation(r);
    expect(d.calls.count).toBe(0);
    expect(r.actionLog.find((e) => e.step === "gather")).toMatchObject({
      actor: "system",
      outcome: "evidence_assessment_failed",
    });
    // Amount and deadline rules still run on the validated dispute.
    expect(r.recommendation.flags).toEqual(["amount_over_limit", "model_failure"]);
  });

  it("escalates when assessEvidence unexpectedly reports an invalid dispute", async () => {
    vi.mocked(assessEvidence).mockImplementationOnce(() => ({
      ok: false,
      error: { kind: "invalid_dispute", message: "x", issues: [] },
    }));
    const r = await runAgent(dispute, deps());
    expectSafeEscalation(r);
    expect(r.actionLog.map((e) => e.outcome)).toContain("evidence_assessment_failed");
  });
});

describe("unexpected internal failure", () => {
  it("returns a safe escalation that keeps the earlier log", async () => {
    vi.mocked(decideFinalAction).mockImplementationOnce(() => {
      throw new Error("kaboom");
    });
    const r = await runAgent(dispute, deps());
    expectSafeEscalation(r);
    // The model output is discarded: the run did not finish normally.
    expect(r.actionLog.at(-1)).toMatchObject({ step: "decide", actor: "system", outcome: "internal_error" });
    expect(r.actionLog.map((e) => e.outcome)).toContain("model_recommended_accept");
    // Flags established before the failure are kept (no delivery proof here).
    expect(r.recommendation.flags).toEqual(["missing_evidence", "amount_over_limit", "model_failure"]);
    const times = r.actionLog.map((e) => Date.parse(e.timestamp));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("still lets InvalidDisputeError reach the caller", async () => {
    await expect(runAgent({ ...dispute, amount: -1 }, deps())).rejects.toBeInstanceOf(InvalidDisputeError);
    expect(assessEvidence).not.toHaveBeenCalled();
  });
});
