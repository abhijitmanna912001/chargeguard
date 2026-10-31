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
]);
export type Flag = z.infer<typeof FlagSchema>;

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
      return;
    }
    if (val.modelOutput.action !== val.finalAction && !val.overrideReason) {
      ctx.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: "overrideReason is required when finalAction differs from the model action",
      });
    }
  });
export type Recommendation = z.infer<typeof RecommendationSchema>;
