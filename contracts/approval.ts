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
    const decided = val.status !== "pending";
    for (const key of ["decidedAt", "decidedBy"] as const) {
      if (decided && !val[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when status is ${val.status}`,
        });
      }
      if (!decided && val[key] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be absent while status is pending`,
        });
      }
    }
  });
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
