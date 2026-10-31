import { describe, expect, it } from "vitest";
import { ResolveApprovalInputSchema, RunAgentInputSchema } from "./schemas";

const base = { disputeId: "d1", approvalId: "a1", decision: "approve" };

describe("RunAgentInputSchema", () => {
  it("accepts a normal id and trims it", () => {
    expect(RunAgentInputSchema.parse({ disputeId: " d1 " })).toEqual({ disputeId: "d1" });
  });
  it("rejects empty, blank, too long and non-string ids", () => {
    for (const disputeId of ["", "   ", "x".repeat(101), null, 5]) {
      expect(RunAgentInputSchema.safeParse({ disputeId }).success).toBe(false);
    }
  });
});

describe("ResolveApprovalInputSchema", () => {
  it("accepts approve and reject, with optional fields", () => {
    expect(ResolveApprovalInputSchema.parse(base)).toEqual({ ...base });
    expect(ResolveApprovalInputSchema.parse({ ...base, decision: "reject", note: "n" }).note).toBe("n");
  });
  it("treats empty resolvedAction and note as absent", () => {
    const out = ResolveApprovalInputSchema.parse({ ...base, resolvedAction: "", note: "  " });
    expect(out.resolvedAction).toBeUndefined();
    expect(out.note).toBeUndefined();
  });
  it("rejects unknown decisions and actions (escalate is not a human choice)", () => {
    expect(ResolveApprovalInputSchema.safeParse({ ...base, decision: "maybe" }).success).toBe(false);
    expect(ResolveApprovalInputSchema.safeParse({ ...base, resolvedAction: "escalate" }).success).toBe(false);
  });
  it("caps the note at 500 characters", () => {
    expect(ResolveApprovalInputSchema.safeParse({ ...base, note: "x".repeat(500) }).success).toBe(true);
    expect(ResolveApprovalInputSchema.safeParse({ ...base, note: "x".repeat(501) }).success).toBe(false);
  });
  it("rejects missing or oversized ids (FormData null)", () => {
    expect(ResolveApprovalInputSchema.safeParse({ ...base, approvalId: null }).success).toBe(false);
    expect(ResolveApprovalInputSchema.safeParse({ ...base, disputeId: "x".repeat(101) }).success).toBe(false);
  });
});
