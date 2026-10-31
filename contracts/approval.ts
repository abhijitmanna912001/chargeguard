import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";
import { ActionSchema, FlagSchema } from "./recommendation";

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/** The outcome a human picked. May differ from the agent's proposedAction. */
export const ResolvedActionSchema = z.enum(["defend", "accept"]);
export type ResolvedAction = z.infer<typeof ResolvedActionSchema>;

export const ApprovalRequestSchema = z
  .object({
    id: IdSchema,
    disputeId: IdSchema,
    recommendationId: IdSchema,
    requestedAt: IsoDateTimeSchema,
    flags: z.array(FlagSchema),
    proposedAction: ActionSchema,
    status: ApprovalStatusSchema,
    resolvedAction: ResolvedActionSchema.optional(),
    decidedBy: IdSchema.optional(),
    decidedAt: IsoDateTimeSchema.optional(),
    note: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const required: Record<ApprovalStatus, readonly string[]> = {
      pending: [],
      approved: ["resolvedAction", "decidedBy", "decidedAt"],
      rejected: ["decidedBy", "decidedAt"],
    };
    for (const key of ["resolvedAction", "decidedBy", "decidedAt"] as const) {
      const present = val[key] !== undefined;
      const needed = required[val.status].includes(key);
      if (needed && !present) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when status is ${val.status}`,
        });
      }
      if (!needed && present) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be absent when status is ${val.status}`,
        });
      }
    }
  });
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
