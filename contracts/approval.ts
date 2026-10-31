import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";
import { ActionSchema, FlagSchema } from "./recommendation";

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z
  .object({
    id: IdSchema,
    disputeId: IdSchema,
    requestedAt: IsoDateTimeSchema,
    flags: z.array(FlagSchema),
    proposedAction: ActionSchema,
    status: ApprovalStatusSchema,
    decidedBy: IdSchema.optional(),
    decidedAt: IsoDateTimeSchema.optional(),
    note: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status !== "pending" && !val.decidedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["decidedAt"],
        message: "decidedAt is required when status is not pending",
      });
    }
  });
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
