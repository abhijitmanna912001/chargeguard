import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, PaiseSchema } from "./common";
import { EvidenceSchema } from "./evidence";

export const DisputeStatusSchema = z.enum([
  "received",
  "gathering",
  "decided",
  "awaiting_approval",
  "submitted",
  "accepted",
  "escalated",
  "expired",
]);
export type DisputeStatus = z.infer<typeof DisputeStatusSchema>;

export const DisputeSchema = z.object({
  id: IdSchema,
  transactionId: IdSchema,
  amount: PaiseSchema,
  reasonCode: z.string().min(1),
  deadline: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  status: DisputeStatusSchema,
  evidence: z.array(EvidenceSchema),
});
export type Dispute = z.infer<typeof DisputeSchema>;
