import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, PaiseSchema } from "./common";

const base = {
  id: IdSchema,
  disputeId: IdSchema,
  collectedAt: IsoDateTimeSchema,
};

export const TransactionEvidenceSchema = z.object({
  ...base,
  type: z.literal("transaction"),
  transactionId: IdSchema,
  amount: PaiseSchema,
  status: z.string().min(1),
  occurredAt: IsoDateTimeSchema,
});

export const SettlementEvidenceSchema = z.object({
  ...base,
  type: z.literal("settlement"),
  settlementId: IdSchema,
  amount: PaiseSchema,
  status: z.string().min(1),
  settledAt: IsoDateTimeSchema,
});

export const DeliveryProofKindSchema = z.enum([
  "courier_tracking",
  "signed_receipt",
  "service_log",
]);

export const DeliveryProofEvidenceSchema = z.object({
  ...base,
  type: z.literal("delivery_proof"),
  kind: DeliveryProofKindSchema,
  deliveredAt: IsoDateTimeSchema,
  reference: z.string().min(1),
});

export const CustomerMessageEvidenceSchema = z.object({
  ...base,
  type: z.literal("customer_message"),
  channel: z.string().min(1),
  sentAt: IsoDateTimeSchema,
  content: z.string(),
  language: z.string().min(1),
});

export const RefundEvidenceSchema = z.object({
  ...base,
  type: z.literal("refund"),
  amount: PaiseSchema,
  status: z.string().min(1),
  issuedAt: IsoDateTimeSchema,
});

export const EvidenceSchema = z.discriminatedUnion("type", [
  TransactionEvidenceSchema,
  SettlementEvidenceSchema,
  DeliveryProofEvidenceSchema,
  CustomerMessageEvidenceSchema,
  RefundEvidenceSchema,
]);

export type Evidence = z.infer<typeof EvidenceSchema>;
export type TransactionEvidence = z.infer<typeof TransactionEvidenceSchema>;
export type SettlementEvidence = z.infer<typeof SettlementEvidenceSchema>;
export type DeliveryProofEvidence = z.infer<typeof DeliveryProofEvidenceSchema>;
export type CustomerMessageEvidence = z.infer<
  typeof CustomerMessageEvidenceSchema
>;
export type RefundEvidence = z.infer<typeof RefundEvidenceSchema>;
