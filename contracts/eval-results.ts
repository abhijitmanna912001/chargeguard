import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";
import { ActionSchema, FlagSchema } from "./recommendation";

/**
 * Shape of eval/results.json: written by scripts/eval-agent.mts, read by
 * /metrics, never edited by hand. Imports only from contracts/.
 */

const NonNegativeIntSchema = z.number().int().nonnegative();

export const EvalCaseResultSchema = z
  .strictObject({
    disputeId: IdSchema,
    expectedAction: ActionSchema,
    finalAction: ActionSchema,
    /** What the model said; null when the model call failed. */
    modelAction: ActionSchema.nullable(),
    correct: z.boolean(),
    confidence: z.number().min(0).max(1).nullable(),
    flags: z.array(FlagSchema),
    evidenceRequirementsMet: NonNegativeIntSchema,
    evidenceRequirementsTotal: NonNegativeIntSchema,
    latencyMs: NonNegativeIntSchema,
    attemptCount: z.number().int().min(1),
    totalTokens: NonNegativeIntSchema.nullable(),
    modelFailure: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.evidenceRequirementsMet > val.evidenceRequirementsTotal) {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceRequirementsMet"],
        message: "evidenceRequirementsMet cannot exceed evidenceRequirementsTotal",
      });
    }
    if (val.correct !== (val.finalAction === val.expectedAction)) {
      ctx.addIssue({
        code: "custom",
        path: ["correct"],
        message: "correct must equal (finalAction === expectedAction)",
      });
    }
  });
export type EvalCaseResult = z.infer<typeof EvalCaseResultSchema>;

export const EvalSummarySchema = z.strictObject({
  total: NonNegativeIntSchema,
  correct: NonNegativeIntSchema,
  accuracy: z.number().min(0).max(1),
  modelFailures: NonNegativeIntSchema,
  medianLatencyMs: z.number().nonnegative(),
  maxLatencyMs: z.number().nonnegative(),
});
export type EvalSummary = z.infer<typeof EvalSummarySchema>;

/** Accuracy and median may be stored rounded; allow for that much. */
const ACCURACY_TOLERANCE = 0.005;
const MEDIAN_TOLERANCE = 0.5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const EvalResultsSchema = z
  .strictObject({
    generatedAt: IsoDateTimeSchema,
    model: z.string().min(1),
    agentMode: z.literal("live"),
    cases: z.array(EvalCaseResultSchema).nonempty(),
    summary: EvalSummarySchema,
  })
  .superRefine((val, ctx) => {
    const { cases, summary } = val;
    const check = (ok: boolean, key: keyof EvalSummary, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: ["summary", key], message });
    };
    const correct = cases.filter((c) => c.correct).length;
    check(summary.total === cases.length, "total", "summary.total must equal the number of cases");
    check(summary.correct === correct, "correct", "summary.correct must equal the number of correct cases");
    check(
      Math.abs(summary.accuracy - correct / cases.length) <= ACCURACY_TOLERANCE,
      "accuracy",
      "summary.accuracy must equal correct / total",
    );
    check(
      summary.modelFailures === cases.filter((c) => c.modelFailure).length,
      "modelFailures",
      "summary.modelFailures must equal the number of cases with modelFailure",
    );
    const latencies = cases.map((c) => c.latencyMs);
    check(
      summary.maxLatencyMs === Math.max(...latencies),
      "maxLatencyMs",
      "summary.maxLatencyMs must equal the largest case latencyMs",
    );
    check(
      Math.abs(summary.medianLatencyMs - median(latencies)) <= MEDIAN_TOLERANCE,
      "medianLatencyMs",
      "summary.medianLatencyMs must equal the median case latencyMs",
    );
  });
export type EvalResults = z.infer<typeof EvalResultsSchema>;
