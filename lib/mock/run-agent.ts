// TEMPORARY: stand-in for agent-core's runAgent(). Same output shape, so callers
// (saveAgentRun, the UI) do not change when the real agent replaces this file.
// Never touches the database. Do not build decision logic on top of this.
import {
  ActionLogEntrySchema,
  RecommendationSchema,
  type ActionLogEntry,
  type Dispute,
  type Recommendation,
} from "../../contracts";

export type AgentRunResult = {
  recommendation: Recommendation;
  actionLog: ActionLogEntry[];
};

export type MockAgentDeps = {
  now: () => Date;
  createId?: () => string;
};

// Same threshold as lib/mock/recommendation.ts (paise).
const ESCALATE_ABOVE_PAISE = 1_000_000;
const MOCK_CONFIDENCE = 0.9;
const RULE_ID = "mock_amount_limit";

export function runMockAgent(dispute: Dispute, deps: MockAgentDeps): AgentRunResult {
  const createId = deps.createId ?? (() => crypto.randomUUID());
  const evidenceRefs = dispute.evidence.map((e) => e.id);
  const overLimit = dispute.amount > ESCALATE_ABOVE_PAISE;
  const action = overLimit ? "escalate" : "defend";

  const entry = (
    step: ActionLogEntry["step"],
    actor: ActionLogEntry["actor"],
    summary: string,
    outcome: string,
    extra: Partial<ActionLogEntry> = {},
  ): ActionLogEntry => ({
    id: createId(),
    disputeId: dispute.id,
    timestamp: deps.now().toISOString(),
    step,
    actor,
    summary,
    evidenceRefs,
    outcome,
    ...extra,
  });

  const actionLog = [
    entry("detect", "agent", `Dispute ${dispute.id} received (reason ${dispute.reasonCode})`, "dispute_detected", {
      evidenceRefs: [],
    }),
    entry("gather", "agent", `Collected ${evidenceRefs.length} evidence item(s)`, "evidence_collected"),
    entry(
      "validate",
      "rule",
      overLimit ? "Amount is over the auto-defend limit" : "Amount is within the auto-defend limit",
      overLimit ? "amount_over_limit" : "within_limit",
      { ruleId: RULE_ID },
    ),
    entry("decide", "rule", `Mock decision: ${action}`, action, { ruleId: RULE_ID, confidence: MOCK_CONFIDENCE }),
  ];

  const recommendation: Recommendation = {
    id: createId(),
    disputeId: dispute.id,
    createdAt: deps.now().toISOString(),
    modelOutput: {
      action,
      confidence: MOCK_CONFIDENCE,
      reasoning: "Mock agent output: decided by the amount limit only.",
      evidenceRefs,
    },
    finalAction: action,
    flags: overLimit ? ["amount_over_limit"] : [],
  };

  return {
    recommendation: RecommendationSchema.parse(recommendation),
    actionLog: actionLog.map((e) => ActionLogEntrySchema.parse(e)),
  };
}
