import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";
import { ActionSchema, FlagSchema } from "./recommendation";

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z.object({
  id: IdSchema,
  disputeId: IdSchema,
  requestedAt: IsoDateTimeSchema,
  flags: z.array(FlagSchema),
  proposedAction: ActionSchema,
  status: ApprovalStatusSchema,
  decidedBy: IdSchema.optional(),
  decidedAt: IsoDateTimeSchema.optional(),
  note: z.string().optional(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
