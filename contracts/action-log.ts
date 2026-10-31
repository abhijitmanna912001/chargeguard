import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";

export const ActionLogStepSchema = z.enum([
  "detect",
  "gather",
  "validate",
  "decide",
  "approve",
  "submit",
  "record",
]);
export type ActionLogStep = z.infer<typeof ActionLogStepSchema>;

export const ActionLogActorSchema = z.enum([
  "agent",
  "rule",
  "human",
  "system",
]);
export type ActionLogActor = z.infer<typeof ActionLogActorSchema>;

export const ActionLogEntrySchema = z.object({
  id: IdSchema,
  disputeId: IdSchema,
  timestamp: IsoDateTimeSchema,
  step: ActionLogStepSchema,
  actor: ActionLogActorSchema,
  summary: z.string(),
  evidenceRefs: z.array(IdSchema),
  confidence: z.number().min(0).max(1).optional(),
  outcome: z.string(),
});
export type ActionLogEntry = z.infer<typeof ActionLogEntrySchema>;
