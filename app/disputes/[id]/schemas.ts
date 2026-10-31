// Input schemas and result type for the dispute Server Actions. Kept out of
// actions.ts because a "use server" file may only export async functions.
import { z } from "zod";
import { ResolvedActionSchema } from "../../../contracts";

const idField = z.string().trim().min(1).max(100);

/** An empty form field means "not provided". */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const RunAgentInputSchema = z.object({ disputeId: idField });
export const SubmitDefenseInputSchema = z.object({ disputeId: idField });

export const ResolveApprovalInputSchema = z.object({
  disputeId: idField,
  approvalId: idField,
  decision: z.enum(["approve", "reject"]),
  resolvedAction: z.preprocess(emptyToUndefined, ResolvedActionSchema.optional()),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
});
export type ResolveApprovalInput = z.infer<typeof ResolveApprovalInputSchema>;

/**
 * The form sends ONE field, `choice`, because a single button cannot set two
 * form fields. It is only an encoding: the server turns it back into
 * decision + resolvedAction and every rule is still checked on the server.
 */
export const APPROVAL_CHOICES = ["approve", "reject", "approve:defend", "approve:accept"] as const;
export type ApprovalChoice = (typeof APPROVAL_CHOICES)[number];

export function decodeApprovalChoice(
  value: unknown,
): { decision: "approve" | "reject"; resolvedAction?: "defend" | "accept" } | null {
  switch (value) {
    case "approve":
      return { decision: "approve" };
    case "reject":
      return { decision: "reject" };
    case "approve:defend":
      return { decision: "approve", resolvedAction: "defend" };
    case "approve:accept":
      return { decision: "approve", resolvedAction: "accept" };
    default:
      return null;
  }
}

/** Shown by submitDefenseAction when the provider rejects a submission. The page shows the specific reason beside Retry. */
export const PROVIDER_REJECTED_MESSAGE = "The payment provider did not accept the response. You can try again.";

export type ActionState = { ok: true } | { ok: false; message: string };
