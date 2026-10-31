import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";

export const ActionSchema = z.enum(["defend", "accept", "escalate"]);
export type Action = z.infer<typeof ActionSchema>;

export const FlagSchema = z.enum([
  "missing_evidence",
  "contradictory_records",
  "deadline_expired",
  "amount_over_limit",
  "low_confidence",
  "model_failure",
  "deadline_at_risk",
  "unsupported_reason_code",
  "refund_issued",
  "transaction_not_successful",
]);
export type Flag = z.infer<typeof FlagSchema>;

/** Flags that forbid defending the dispute. */
export const BLOCKING_FLAGS: readonly Flag[] = [
  "missing_evidence",
  "contradictory_records",
  "deadline_expired",
  "amount_over_limit",
  "low_confidence",
  "model_failure",
  "unsupported_reason_code",
  "transaction_not_successful",
];

/** What the model returns. Advisory only; rules decide the final action. */
export const ModelOutputSchema = z.object({
  action: ActionSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  evidenceRefs: z.array(IdSchema),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export const RecommendationSchema = z
  .object({
    id: IdSchema,
    disputeId: IdSchema,
    createdAt: IsoDateTimeSchema,
    modelOutput: ModelOutputSchema.nullable(),
    finalAction: ActionSchema,
    overrideReason: z.string().optional(),
    flags: z.array(FlagSchema),
  })
  .superRefine((val, ctx) => {
    if (val.modelOutput === null) {
      if (!val.flags.includes("model_failure")) {
        ctx.addIssue({
          code: "custom",
          path: ["flags"],
          message: "flags must include model_failure when modelOutput is null",
        });
      }
      if (val.finalAction !== "escalate") {
        ctx.addIssue({
          code: "custom",
          path: ["finalAction"],
          message: "finalAction must be escalate when modelOutput is null",
        });
      }
    } else if (val.modelOutput.action !== val.finalAction && !val.overrideReason) {
      ctx.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: "overrideReason is required when finalAction differs from the model action",
      });
    }
    if (
      val.finalAction === "defend" &&
      val.flags.some((f) => BLOCKING_FLAGS.includes(f))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["finalAction"],
        message: "finalAction cannot be defend when a blocking flag is present",
      });
    }
    if (val.flags.includes("amount_over_limit") && val.finalAction !== "escalate") {
      ctx.addIssue({
        code: "custom",
        path: ["finalAction"],
        message: "finalAction must be escalate when amount_over_limit is present",
      });
    }
  });
export type Recommendation = z.infer<typeof RecommendationSchema>;
