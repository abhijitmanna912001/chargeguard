import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";

export const SubmissionStatusSchema = z.enum(["pending", "submitted", "failed"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const SubmissionResultSchema = z.object({
  id: IdSchema,
  disputeId: IdSchema,
  idempotencyKey: IdSchema,
  status: SubmissionStatusSchema,
  submittedAt: IsoDateTimeSchema.optional(),
  providerRef: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type SubmissionResult = z.infer<typeof SubmissionResultSchema>;
