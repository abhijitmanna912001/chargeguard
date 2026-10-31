import { describe, expect, it } from "vitest";
import {
  ApprovalRequestSchema,
  BLOCKING_FLAGS,
  EvidenceSchema,
  MAX_PAISE,
  PaiseSchema,
  RecommendationSchema,
  SubmissionResultSchema,
  type Flag,
} from "./index";

const T = "2026-01-01T00:00:00Z";

describe("PaiseSchema", () => {
  it("accepts 0 and the cap", () => {
    expect(PaiseSchema.safeParse(0).success).toBe(true);
    expect(PaiseSchema.safeParse(MAX_PAISE).success).toBe(true);
    expect(MAX_PAISE).toBe(2147483647);
  });
  it("rejects above the cap", () => {
    expect(PaiseSchema.safeParse(MAX_PAISE + 1).success).toBe(false);
  });
  it("rejects unsafe integers", () => {
    expect(PaiseSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(PaiseSchema.safeParse(Infinity).success).toBe(false);
  });
  it("rejects negatives and fractions", () => {
    expect(PaiseSchema.safeParse(-1).success).toBe(false);
    expect(PaiseSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("RecommendationSchema", () => {
  const modelOutput = {
    action: "defend",
    confidence: 0.9,
    reasoning: "Delivery proof matches.",
    evidenceRefs: ["e1"],
  };
  const base = {
    id: "r1",
    disputeId: "d1",
    createdAt: T,
    modelOutput,
    finalAction: "defend",
    flags: [] as Flag[],
  };
  const ok = (v: unknown) => RecommendationSchema.safeParse(v).success;

  it("accepts a clean defend", () => {
    expect(ok(base)).toBe(true);
  });

  it("rejects defend with each blocking flag", () => {
    for (const flag of BLOCKING_FLAGS) {
      // amount_over_limit also demands escalate; defend must fail either way.
      expect(ok({ ...base, flags: [flag] }), flag).toBe(false);
    }
  });

  it("allows defend with non-blocking flags", () => {
    for (const flag of ["deadline_at_risk", "refund_issued"] as const) {
      expect(ok({ ...base, flags: [flag] }), flag).toBe(true);
    }
  });

  it("allows accept or escalate with a blocking flag", () => {
    const flags = ["missing_evidence"];
    const reason = { overrideReason: "Evidence incomplete." };
    expect(ok({ ...base, finalAction: "accept", flags, ...reason })).toBe(true);
    expect(ok({ ...base, finalAction: "escalate", flags, ...reason })).toBe(true);
  });

  it("requires escalate when amount_over_limit is present", () => {
    const flags = ["amount_over_limit"];
    const reason = { overrideReason: "Over limit." };
    expect(ok({ ...base, finalAction: "accept", flags, ...reason })).toBe(false);
    expect(ok({ ...base, finalAction: "escalate", flags, ...reason })).toBe(true);
  });

  it("requires model_failure and escalate when modelOutput is null", () => {
    const nullBase = { ...base, modelOutput: null };
    expect(ok({ ...nullBase, finalAction: "escalate", flags: ["model_failure"] })).toBe(true);
    expect(ok({ ...nullBase, finalAction: "escalate", flags: [] })).toBe(false);
    expect(ok({ ...nullBase, finalAction: "accept", flags: ["model_failure"] })).toBe(false);
  });

  it("requires overrideReason when finalAction differs from the model action", () => {
    expect(ok({ ...base, finalAction: "accept" })).toBe(false);
    expect(ok({ ...base, finalAction: "accept", overrideReason: "Policy." })).toBe(true);
  });

  it("rejects out-of-range confidence and empty reasoning", () => {
    expect(ok({ ...base, modelOutput: { ...modelOutput, confidence: 1.1 } })).toBe(false);
    expect(ok({ ...base, modelOutput: { ...modelOutput, reasoning: "" } })).toBe(false);
  });
});

describe("EvidenceSchema", () => {
  const common = { id: "e1", disputeId: "d1", collectedAt: T };
  const ok = (v: unknown) => EvidenceSchema.safeParse(v).success;

  const settlement = {
    ...common,
    type: "settlement",
    settlementId: "s1",
    amount: 1000,
  };
  const refund = { ...common, type: "refund", amount: 1000 };

  it("requires settledAt only when settled", () => {
    expect(ok({ ...settlement, status: "settled" })).toBe(false);
    expect(ok({ ...settlement, status: "settled", settledAt: T })).toBe(true);
    expect(ok({ ...settlement, status: "pending" })).toBe(true);
    expect(ok({ ...settlement, status: "failed" })).toBe(true);
  });

  it("requires issuedAt only when issued", () => {
    expect(ok({ ...refund, status: "issued" })).toBe(false);
    expect(ok({ ...refund, status: "issued", issuedAt: T })).toBe(true);
    expect(ok({ ...refund, status: "pending" })).toBe(true);
    expect(ok({ ...refund, status: "failed" })).toBe(true);
  });

  it("rejects unknown status and channel values", () => {
    expect(ok({ ...settlement, status: "done", settledAt: T })).toBe(false);
    expect(
      ok({
        ...common,
        type: "customer_message",
        channel: "pigeon",
        sentAt: T,
        content: "hi",
        language: "en",
      }),
    ).toBe(false);
  });

  it("accepts a valid transaction", () => {
    expect(
      ok({
        ...common,
        type: "transaction",
        transactionId: "t1",
        amount: 500,
        status: "success",
        occurredAt: T,
      }),
    ).toBe(true);
  });
});

describe("ApprovalRequestSchema", () => {
  const base = {
    id: "a1",
    disputeId: "d1",
    requestedAt: T,
    flags: [],
    proposedAction: "defend",
  };
  const ok = (v: unknown) => ApprovalRequestSchema.safeParse(v).success;

  it("accepts pending with no decision fields", () => {
    expect(ok({ ...base, status: "pending" })).toBe(true);
  });

  it("forbids resolvedAction, decidedAt and decidedBy while pending", () => {
    expect(ok({ ...base, status: "pending", decidedAt: T })).toBe(false);
    expect(ok({ ...base, status: "pending", decidedBy: "u1" })).toBe(false);
    expect(ok({ ...base, status: "pending", resolvedAction: "defend" })).toBe(false);
  });

  const decision = { decidedAt: T, decidedBy: "u1" };

  it("requires resolvedAction, decidedBy and decidedAt when approved", () => {
    const full = { ...base, status: "approved", resolvedAction: "defend", ...decision };
    expect(ok(full)).toBe(true);
    expect(ok({ ...full, resolvedAction: undefined })).toBe(false);
    expect(ok({ ...full, decidedBy: undefined })).toBe(false);
    expect(ok({ ...full, decidedAt: undefined })).toBe(false);
  });

  it("allows resolvedAction to differ from proposedAction", () => {
    const approved = { ...base, status: "approved", ...decision };
    expect(ok({ ...approved, resolvedAction: "accept" })).toBe(true);
    expect(ok({ ...approved, proposedAction: "escalate", resolvedAction: "defend" })).toBe(true);
  });

  it("rejects an escalate resolvedAction", () => {
    const approved = { ...base, status: "approved", ...decision };
    expect(ok({ ...approved, resolvedAction: "escalate" })).toBe(false);
  });

  it("requires decidedBy and decidedAt when rejected", () => {
    const rejected = { ...base, status: "rejected", ...decision };
    expect(ok(rejected)).toBe(true);
    expect(ok({ ...rejected, decidedBy: undefined })).toBe(false);
    expect(ok({ ...rejected, decidedAt: undefined })).toBe(false);
  });

  it("forbids resolvedAction when rejected", () => {
    const rejected = { ...base, status: "rejected", ...decision };
    expect(ok({ ...rejected, resolvedAction: "accept" })).toBe(false);
  });
});

describe("SubmissionResultSchema", () => {
  const base = { id: "s1", disputeId: "d1", idempotencyKey: "k1" };
  const ok = (v: unknown) => SubmissionResultSchema.safeParse(v).success;

  it("requires submittedAt when submitted", () => {
    expect(ok({ ...base, status: "submitted" })).toBe(false);
    expect(ok({ ...base, status: "submitted", submittedAt: T })).toBe(true);
  });

  it("does not require submittedAt for pending or failed", () => {
    expect(ok({ ...base, status: "pending" })).toBe(true);
    expect(ok({ ...base, status: "failed", errorMessage: "timeout" })).toBe(true);
  });
});
