import { describe, expect, it } from "vitest";
import { checkDecisionShape, nextDisputeStatus, resolveAgainstProposal } from "./approval-rules";

describe("checkDecisionShape", () => {
  it("requires a resolved action when approving", () => {
    expect(checkDecisionShape("approved", undefined)).not.toBeNull();
    expect(checkDecisionShape("approved", "defend")).toBeNull();
    expect(checkDecisionShape("approved", "accept")).toBeNull();
  });
  it("forbids a resolved action when rejecting", () => {
    expect(checkDecisionShape("rejected", undefined)).toBeNull();
    expect(checkDecisionShape("rejected", "defend")).not.toBeNull();
  });
});

describe("nextDisputeStatus", () => {
  it("maps decisions to statuses", () => {
    expect(nextDisputeStatus("approved", "defend")).toBe("decided");
    expect(nextDisputeStatus("approved", "accept")).toBe("accepted");
    expect(nextDisputeStatus("rejected", undefined)).toBe("escalated");
  });
});

describe("resolveAgainstProposal", () => {
  it("approve of defend/accept resolves to exactly the proposal", () => {
    expect(resolveAgainstProposal("defend", "approved", undefined)).toEqual({ ok: true, resolvedAction: "defend" });
    expect(resolveAgainstProposal("accept", "approved", "accept")).toEqual({ ok: true, resolvedAction: "accept" });
  });
  it("refuses an approval that differs from the proposal", () => {
    expect(resolveAgainstProposal("defend", "approved", "accept")).toEqual({ ok: false, code: "must_match_proposal" });
    expect(resolveAgainstProposal("accept", "approved", "defend")).toEqual({ ok: false, code: "must_match_proposal" });
  });
  it("approve of escalate needs the human to choose", () => {
    expect(resolveAgainstProposal("escalate", "approved", undefined)).toEqual({ ok: false, code: "action_required" });
    expect(resolveAgainstProposal("escalate", "approved", "defend")).toEqual({ ok: true, resolvedAction: "defend" });
  });
  it("reject never carries an action", () => {
    expect(resolveAgainstProposal("defend", "rejected", undefined)).toEqual({ ok: true, resolvedAction: undefined });
    expect(resolveAgainstProposal("escalate", "rejected", "accept")).toEqual({ ok: false, code: "action_not_allowed" });
  });
});
