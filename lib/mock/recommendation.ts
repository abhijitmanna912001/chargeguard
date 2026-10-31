// TEMPORARY: placeholder recommendation for the dispute list UI. To be replaced
// by the real agent output (agent-core/ + the stored Recommendation row). Do not
// build decision logic on top of this.
import type { Action, Dispute } from "../../contracts";

export type MockRecommendation = { action: Action; label: "Mock" };

const ESCALATE_ABOVE_PAISE = 1_000_000;

export function getMockRecommendation(dispute: Dispute): MockRecommendation {
  return {
    action: dispute.amount > ESCALATE_ABOVE_PAISE ? "escalate" : "defend",
    label: "Mock",
  };
}
