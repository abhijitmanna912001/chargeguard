import { z } from "zod";
import { IdSchema } from "./common";

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

export const RecommendationSchema = z.object({
  modelAction: ActionSchema,
  finalAction: ActionSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  evidenceRefs: z.array(IdSchema),
  overrideReason: z.string().optional(),
  flags: z.array(FlagSchema),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;
