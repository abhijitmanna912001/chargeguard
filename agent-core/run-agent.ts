import "server-only";
import {
  ActionLogEntrySchema,
  DisputeSchema,
  FlagSchema,
  IsoDateTimeSchema,
  ModelOutputSchema,
  RecommendationSchema,
  type ActionLogEntry,
  type Dispute,
  type Flag,
  type ModelOutput,
  type Recommendation,
} from "../contracts";
import {
  checkDeadline,
  decideFinalAction,
  isLowConfidence,
  isOverAmountLimit,
  AMOUNT_ESCALATION_THRESHOLD_PAISE,
  DEADLINE_RISK_WINDOW_MS,
  LOW_CONFIDENCE_THRESHOLD,
  RULE_IDS,
} from "./decision-policy";
import { InvalidDisputeError } from "./errors";
import { assessEvidence, type EvidenceAssessment } from "./evidence";
import { ModelError } from "./model/errors";
import type { StructuredCallSarvam } from "./model/mock";
import { toIssues } from "./model/parse";
import { buildModelContext, buildModelRequest } from "./model-context";

// The agent orchestrator: evidence assessment, one Sarvam recommendation, then
// the deterministic rules in decision-policy.ts pick the final action. Pure
// with respect to storage: it never touches the database, never asks for
// approval and never submits. saveAgentRun() persists what this returns.
//
// The model is called even when a rule (amount, deadline, blocking evidence)
// already forces escalation. This is intentional for the prototype: the
// stored Recommendation keeps the model's advisory view next to the rule
// that overrode it, which is what a reviewer needs to see. Rules still decide.

export type RunAgentDependencies = {
  /**
   * Required, with no default: the caller chooses the real callSarvam or a
   * mock (createMockCallSarvam), so runAgent never reaches Sarvam implicitly.
   */
  callSarvam: StructuredCallSarvam;
  now: () => Date;
  /** Raw unique id component; runAgent adds the rec_ / log_ prefix. Defaults to crypto.randomUUID. */
  createId?: () => string;
};

export type AgentRunResult = {
  recommendation: Recommendation;
  actionLog: ActionLogEntry[];
};

/**
 * Throws only InvalidDisputeError, when the dispute fails DisputeSchema.
 * Everything after that (a broken injected clock, evidence problems, model
 * failures, internal errors) comes back as a schema-valid result: an
 * escalation whenever no usable model output survives.
 */
export async function runAgent(dispute: Dispute, deps: RunAgentDependencies): Promise<AgentRunResult> {
  const parsed = DisputeSchema.safeParse(dispute);
  if (!parsed.success) throw new InvalidDisputeError(toIssues(parsed.error));

  const run = startRun(parsed.data, deps);
  try {
    // No fallback: a missing callSarvam fails inside recommend() and escalates.
    return await orchestrate(run, deps?.callSarvam);
  } catch {
    // The exception is dropped on purpose: its message may echo evidence.
    return internalFailure(run);
  }
}

// ---------------------------------------------------------------------------
// Run state: clock, ids, flags and the action log
// ---------------------------------------------------------------------------

type Run = {
  dispute: Dispute;
  /** First clock reading; deadline rules are evaluated against it. */
  startMs: number;
  flags: Set<Flag>;
  log: ActionLogEntry[];
  stamp: () => string;
  nextId: (prefix: "rec" | "log") => string;
  /** "failed" once the injected clock has been replaced; "reported" once logged. */
  clock: "ok" | "failed" | "reported";
};

type EntryFields = Omit<ActionLogEntry, "id" | "disputeId" | "timestamp">;

/** Leaves a year of 1 ms increments before timestamps would leave the 4-digit year range. */
const LATEST_CLOCK_MS = Date.parse("9999-01-01T00:00:00.000Z");

/** Epoch ms from the injected clock, or undefined if it throws or is not a usable date. */
function readInjectedClock(deps: RunAgentDependencies): number | undefined {
  try {
    const ms = deps.now().getTime();
    // Also rejects valid Dates that IsoDateTimeSchema would not accept (e.g. year 20000).
    return ms < LATEST_CLOCK_MS && IsoDateTimeSchema.safeParse(new Date(ms).toISOString()).success ? ms : undefined;
  } catch {
    return undefined;
  }
}

function startRun(dispute: Dispute, deps: RunAgentDependencies): Run {
  const run: Run = {
    dispute,
    startMs: 0,
    flags: new Set(),
    log: [],
    stamp: () => "",
    nextId: () => "",
    clock: "ok",
  };

  // The injected clock when it works, otherwise the system clock; the switch
  // is recorded once in the log (see log()).
  const readClock = () => {
    const injected = readInjectedClock(deps);
    if (injected !== undefined) return injected;
    if (run.clock === "ok") run.clock = "failed";
    return Date.now();
  };
  run.startMs = readClock();

  // Logical action-sequence timestamps: the clock, advanced by at least 1 ms
  // per entry so entries sort in execution order. They are not separate
  // provider wall-clock measurements.
  let last = run.startMs - 1;
  run.stamp = () => {
    last = Math.max(readClock(), last + 1);
    return new Date(last).toISOString();
  };

  // An injected id that throws, is empty or repeats within the run falls back
  // to a random UUID, so one run never produces duplicate ids.
  const used = new Set<string>();
  run.nextId = (prefix) => {
    let id = "";
    try {
      const raw = deps.createId?.() ?? crypto.randomUUID();
      if (typeof raw === "string" && raw.length > 0) id = `${prefix}_${raw}`;
    } catch {
      // fall through to the random id below
    }
    while (id === "" || used.has(id)) id = `${prefix}_${crypto.randomUUID()}`;
    used.add(id);
    return id;
  };

  return run;
}

function entry(run: Run, fields: EntryFields): ActionLogEntry {
  return ActionLogEntrySchema.parse({
    id: run.nextId("log"),
    disputeId: run.dispute.id,
    timestamp: run.stamp(),
    ...fields,
  });
}

/**
 * Validates before appending, so the log only ever holds schema-valid
 * entries. The first time a timestamp came from the system clock, a system
 * entry saying so follows the entry that used it.
 */
function log(run: Run, fields: EntryFields): ActionLogEntry {
  const written = entry(run, fields);
  run.log.push(written);
  if (run.clock === "failed") {
    run.clock = "reported";
    run.log.push(
      entry(run, {
        step: written.step,
        actor: "system",
        summary: "Injected clock failed or returned an invalid date; system clock used for timestamps",
        evidenceRefs: [],
        outcome: "clock_fallback",
      }),
    );
  }
  return written;
}

function orderedFlags(flags: Iterable<Flag>): Flag[] {
  const set = new Set(flags);
  return FlagSchema.options.filter((flag) => set.has(flag));
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function orchestrate(run: Run, call: StructuredCallSarvam): Promise<AgentRunResult> {
  const { dispute } = run;
  log(run, {
    step: "detect",
    actor: "system",
    summary: `Dispute ${dispute.id} received for analysis (reason code ${dispute.reasonCode}, ${dispute.amount} paise, ${dispute.evidence.length} evidence record(s))`,
    evidenceRefs: [],
    outcome: "dispute_detected",
  });

  const assessment = gatherEvidence(run);
  const ruleFlags = applyDisputeRules(run);

  let modelOutput: ModelOutput | null = null;
  if (assessment) {
    modelOutput = await recommend(run, assessment, ruleFlags, call);
  }
  if (modelOutput === null) run.flags.add("model_failure");

  return finish(run, modelOutput);
}

function gatherEvidence(run: Run): EvidenceAssessment | null {
  let assessment: EvidenceAssessment | null = null;
  try {
    const result = assessEvidence(run.dispute);
    if (result.ok) assessment = result;
  } catch {
    // reported below as a safe outcome code
  }

  if (!assessment) {
    log(run, {
      step: "gather",
      actor: "system",
      summary: "Evidence assessment failed; no evidence was used and the model was not called",
      evidenceRefs: [],
      outcome: "evidence_assessment_failed",
    });
    return null;
  }

  for (const flag of assessment.flags) run.flags.add(flag);
  const trusted = assessment.evidenceRefs;
  log(run, {
    step: "gather",
    actor: "system",
    summary: `Assessed ${run.dispute.evidence.length} evidence record(s): ${assessment.trustedEvidence.length} trusted, ${assessment.excludedEvidence.length} excluded`,
    evidenceRefs: trusted,
    outcome: "evidence_assessed",
  });

  const c = assessment.evidenceCompleteness;
  const completeness =
    c.policy === null
      ? "reason code has no evidence policy"
      : `${c.satisfiedCount} of ${c.requiredCount} evidence requirement(s) met`;
  log(run, {
    step: "validate",
    actor: "rule",
    summary: `Evidence check: ${completeness}; ${assessment.flags.length ? `flags ${assessment.flags.join(", ")}` : "no evidence flags"}`,
    evidenceRefs: trusted,
    ruleId: RULE_IDS.evidenceAssessment,
    outcome: assessment.flags.length ? "evidence_flags_raised" : "evidence_clear",
  });
  return assessment;
}

/** Amount and deadline rules. They need only the validated dispute and the clock. */
function applyDisputeRules(run: Run): Flag[] {
  const { dispute } = run;
  const ruleFlags: Flag[] = [];

  const overLimit = isOverAmountLimit(dispute.amount);
  if (overLimit) ruleFlags.push("amount_over_limit");
  log(run, {
    step: "validate",
    actor: "rule",
    summary: `Amount ${dispute.amount} paise is ${overLimit ? "above" : "within"} the ${AMOUNT_ESCALATION_THRESHOLD_PAISE} paise limit`,
    evidenceRefs: [],
    ruleId: RULE_IDS.amountLimit,
    outcome: overLimit ? "amount_over_limit" : "amount_within_limit",
  });

  const deadline = checkDeadline(dispute.deadline, run.startMs);
  if (deadline.flag) ruleFlags.push(deadline.flag);
  const hours = (Math.abs(deadline.remainingMs) / 3_600_000).toFixed(1);
  const windowHours = DEADLINE_RISK_WINDOW_MS / 3_600_000;
  const deadlineSummary = {
    expired: `Deadline passed ${hours} hour(s) ago`,
    at_risk: `Deadline in ${hours} hour(s), inside the ${windowHours} hour risk window`,
    ok: `Deadline in ${hours} hour(s), outside the ${windowHours} hour risk window`,
  }[deadline.status];
  log(run, {
    step: "validate",
    actor: "rule",
    summary: deadlineSummary,
    evidenceRefs: [],
    ruleId: RULE_IDS.deadlineWindow,
    outcome: deadline.flag ?? "deadline_ok",
  });

  for (const flag of ruleFlags) run.flags.add(flag);
  return ruleFlags;
}

/** One model call. Returns null (and logs why) for every kind of model failure. */
async function recommend(
  run: Run,
  assessment: EvidenceAssessment,
  ruleFlags: readonly Flag[],
  call: StructuredCallSarvam,
): Promise<ModelOutput | null> {
  const failed = (kind: string) => {
    log(run, {
      step: "decide",
      actor: "system",
      summary: `Model call failed (${kind}); no model output was used`,
      evidenceRefs: [],
      outcome: `model_failure:${kind}`,
    });
    return null;
  };

  let output: ModelOutput;
  try {
    const result = await call(buildModelRequest(buildModelContext(assessment, ruleFlags)));
    if (!result.ok) return failed(result.error instanceof ModelError ? result.error.kind : "unknown_error");
    // callSarvam already validated this; checked again because the
    // dependency is injectable and nothing downstream may trust it blindly.
    const parsed = ModelOutputSchema.safeParse(result.value.output);
    if (!parsed.success) return failed("schema_validation_failed");
    output = parsed.data;
  } catch {
    return failed("exception");
  }

  const trusted = new Set(assessment.evidenceRefs);
  const untrusted = output.evidenceRefs.filter((ref) => !trusted.has(ref));
  if (untrusted.length > 0) {
    // The offending ids are never written anywhere: they may be another
    // dispute's records.
    log(run, {
      step: "validate",
      actor: "rule",
      summary: `Model cited ${untrusted.length} evidence reference(s) that are not trusted records of this dispute; output discarded`,
      evidenceRefs: [],
      ruleId: RULE_IDS.modelEvidenceRefs,
      outcome: "model_failure:untrusted_evidence_ref",
    });
    return null;
  }

  log(run, {
    step: "decide",
    actor: "agent",
    summary: `Model recommended ${output.action} (advisory only; rules decide)`,
    evidenceRefs: output.evidenceRefs,
    confidence: output.confidence,
    outcome: `model_recommended_${output.action}`,
  });
  log(run, {
    step: "validate",
    actor: "rule",
    summary: `All ${output.evidenceRefs.length} evidence reference(s) cited by the model are trusted records`,
    evidenceRefs: output.evidenceRefs,
    ruleId: RULE_IDS.modelEvidenceRefs,
    outcome: "model_evidence_refs_trusted",
  });

  const low = isLowConfidence(output.confidence);
  if (low) run.flags.add("low_confidence");
  log(run, {
    step: "validate",
    actor: "rule",
    summary: `Model confidence ${output.confidence} is ${low ? "below" : "at or above"} the ${LOW_CONFIDENCE_THRESHOLD} threshold`,
    evidenceRefs: [],
    confidence: output.confidence,
    ruleId: RULE_IDS.lowConfidence,
    outcome: low ? "low_confidence" : "confidence_ok",
  });
  return output;
}

function finish(run: Run, modelOutput: ModelOutput | null): AgentRunResult {
  const flags = orderedFlags(run.flags);
  const decision = decideFinalAction(modelOutput, flags);
  const entry = log(run, {
    step: "decide",
    actor: "rule",
    summary: `Final action ${decision.finalAction}: ${decision.reason}`,
    evidenceRefs: modelOutput?.evidenceRefs ?? [],
    ...(modelOutput ? { confidence: modelOutput.confidence } : {}),
    ruleId: decision.ruleId,
    outcome: decision.finalAction,
  });

  const recommendation = RecommendationSchema.parse({
    id: run.nextId("rec"),
    disputeId: run.dispute.id,
    createdAt: entry.timestamp,
    modelOutput,
    finalAction: decision.finalAction,
    ...(decision.overrideReason ? { overrideReason: decision.overrideReason } : {}),
    flags,
  });
  return { recommendation, actionLog: [...run.log] };
}

/** Last resort after an unexpected error: keep what was logged, escalate. */
function internalFailure(run: Run): AgentRunResult {
  const final = log(run, {
    step: "decide",
    actor: "system",
    summary: "Internal error during analysis; escalated for human review",
    evidenceRefs: [],
    ruleId: RULE_IDS.modelFailure,
    outcome: "internal_error",
  });
  const recommendation = RecommendationSchema.parse({
    id: run.nextId("rec"),
    disputeId: run.dispute.id,
    createdAt: final.timestamp,
    modelOutput: null,
    finalAction: "escalate",
    flags: orderedFlags([...run.flags, "model_failure"]),
  });
  return { recommendation, actionLog: [...run.log] };
}
