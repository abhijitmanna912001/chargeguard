// Input schemas and result type for the dispute Server Actions. Kept out of
// actions.ts because a "use server" file may only export async functions.
import { z } from "zod";
import { ResolvedActionSchema } from "../../../contracts";

const idField = z.string().trim().min(1).max(100);

/** An empty form field means "not provided". */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const RunAgentInputSchema = z.object({ disputeId: idField });

export const ResolveApprovalInputSchema = z.object({
  disputeId: idField,
  approvalId: idField,
  decision: z.enum(["approve", "reject"]),
  resolvedAction: z.preprocess(emptyToUndefined, ResolvedActionSchema.optional()),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
});
export type ResolveApprovalInput = z.infer<typeof ResolveApprovalInputSchema>;

export type ActionState = { ok: true } | { ok: false; message: string };
