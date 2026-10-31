import { BLOCKING_FLAGS, type Action, type Flag, type ModelOutput, type Paise } from "../contracts";

// SYNTHETIC DEMO POLICIES. These thresholds and the priority order below were
// agreed for the ChargeGuard prototype. They are not official Paytm,
// issuing-bank or card-network rules and must not be presented as such.
//
// Pure functions: no clock, no I/O. The caller passes "now" in.
//
// The model only recommends. decideFinalAction applies these rules, in order,
// to produce the PROPOSED final action:
//   1. No usable model output        -> escalate
//   2. amount_over_limit             -> escalate
//   3. low_confidence                -> escalate
//   4. model recommends escalate     -> escalate
//   5. model recommends accept       -> accept is kept as the proposal
//                                       (no confirmed rule changes it)
//   6. model recommends defend       -> escalate if any BLOCKING_FLAGS, else defend
//
// Accept is only ever the model's recommendation, preserved. No rule produces
// accept on its own: rules can only move a proposal to escalate. Blocking
// flags stop a defence and lead to escalation; they never lead to accept, and
// neither does an expired deadline (deadline_expired is blocking, so it
// prevents defend and nothing more). deadline_at_risk and refund_issued are
// not blocking and never change the action on their own.
//
// Nothing here is executed. runAgent() returns a Recommendation and never
// approves, accepts or submits anything; every proposed action, accept
// included, goes through the downstream human approval workflow.

/** Escalate when the disputed amount is strictly above this. 1,000,000 paise = ₹10,000. */
export const AMOUNT_ESCALATION_THRESHOLD_PAISE: Paise = 1_000_000;

/** Escalate when model confidence is strictly below this. Exactly 0.7 passes. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** deadline_at_risk when the deadline is in the future but strictly less than this away. */
export const DEADLINE_RISK_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Stable ids written to ActionLogEntry.ruleId. */
export const RULE_IDS = {
  evidenceAssessment: "rule_evidence_assessment",
  amountLimit: "rule_amount_limit",
  deadlineWindow: "rule_deadline_window",
  modelEvidenceRefs: "rule_model_evidence_refs",
  lowConfidence: "rule_low_confidence",
  modelFailure: "rule_model_failure",
  blockingFlags: "rule_blocking_flags",
  modelRecommendation: "rule_model_recommendation",
} as const;
export type RuleId = (typeof RULE_IDS)[keyof typeof RULE_IDS];

export function isOverAmountLimit(amount: Paise): boolean {
  return amount > AMOUNT_ESCALATION_THRESHOLD_PAISE;
}

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

export type DeadlineCheck = {
  status: "expired" | "at_risk" | "ok";
  remainingMs: number;
  flag?: Extract<Flag, "deadline_expired" | "deadline_at_risk">;
};

/** Expired at or after the deadline; at risk when strictly under the window remains. */
export function checkDeadline(deadline: string, nowMs: number): DeadlineCheck {
  const remainingMs = Date.parse(deadline) - nowMs;
  if (remainingMs <= 0) return { status: "expired", remainingMs, flag: "deadline_expired" };
  if (remainingMs < DEADLINE_RISK_WINDOW_MS) return { status: "at_risk", remainingMs, flag: "deadline_at_risk" };
  return { status: "ok", remainingMs };
}

export function blockingFlagsIn(flags: readonly Flag[]): Flag[] {
  return flags.filter((flag) => BLOCKING_FLAGS.includes(flag));
}

export type FinalDecision = {
  finalAction: Action;
  ruleId: RuleId;
  /** Why this action was chosen. Built from enums and constants only. */
  reason: string;
  /** Set only when finalAction differs from the model's action. */
  overrideReason?: string;
};

/** The proposed action for human approval, per the order above. Executes nothing. */
export function decideFinalAction(modelOutput: ModelOutput | null, flags: readonly Flag[]): FinalDecision {
  if (modelOutput === null) {
    return {
      finalAction: "escalate",
      ruleId: RULE_IDS.modelFailure,
      reason: "No usable model output; escalated for human review",
    };
  }

  const escalate = (ruleId: RuleId, reason: string): FinalDecision => ({
    finalAction: "escalate",
    ruleId,
    reason,
    ...(modelOutput.action === "escalate" ? {} : { overrideReason: reason }),
  });

  if (flags.includes("amount_over_limit")) {
    return escalate(
      RULE_IDS.amountLimit,
      `Amount is above the ${AMOUNT_ESCALATION_THRESHOLD_PAISE} paise limit; rules require escalation`,
    );
  }
  if (flags.includes("low_confidence")) {
    return escalate(
      RULE_IDS.lowConfidence,
      `Model confidence is below ${LOW_CONFIDENCE_THRESHOLD}; rules require escalation`,
    );
  }
  if (modelOutput.action === "escalate") {
    return { finalAction: "escalate", ruleId: RULE_IDS.modelRecommendation, reason: "Model recommended escalation" };
  }
  if (modelOutput.action === "accept") {
    return { finalAction: "accept", ruleId: RULE_IDS.modelRecommendation, reason: "Model recommended accepting" };
  }

  const blocking = blockingFlagsIn(flags);
  if (blocking.length > 0) {
    return escalate(
      RULE_IDS.blockingFlags,
      `Blocking flags present (${blocking.join(", ")}); defend is not allowed, escalated for human review`,
    );
  }
  return { finalAction: "defend", ruleId: RULE_IDS.modelRecommendation, reason: "Model recommended defending; no blocking flags" };
}
