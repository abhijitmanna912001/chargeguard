import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";

export const SubmissionStatusSchema = z.enum(["pending", "submitted", "failed"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const SubmissionResultSchema = z
  .object({
    id: IdSchema,
    disputeId: IdSchema,
    idempotencyKey: IdSchema,
    status: SubmissionStatusSchema,
    submittedAt: IsoDateTimeSchema.optional(),
    providerRef: z.string().optional(),
    errorMessage: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === "submitted" && !val.submittedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["submittedAt"],
        message: "submittedAt is required when status is submitted",
      });
    }
  });
export type SubmissionResult = z.infer<typeof SubmissionResultSchema>;
