import { z } from "zod";
import { IdSchema, PaiseSchema } from "./common";

/**
 * The defense response sent to the payment provider. It lives in contracts/
 * because three layers share it: the service that builds it, the integration
 * client that sends it and the simulated provider route that validates it.
 */
export const DefensePackageSchema = z.object({
  disputeId: IdSchema,
  reasonCode: z.string().min(1),
  amountPaise: PaiseSchema,
  summary: z.string().min(1).max(2000),
  evidenceRefs: z.array(IdSchema),
});
export type DefensePackage = z.infer<typeof DefensePackageSchema>;
