import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, PaiseSchema } from "./common";

export const TransactionStatusSchema = z.enum(["success", "failed", "pending"]);
export const SettlementStatusSchema = z.enum(["settled", "pending", "failed"]);
export const RefundStatusSchema = z.enum(["issued", "pending", "failed"]);
export const MessageChannelSchema = z.enum(["whatsapp", "sms", "email", "call"]);

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
  status: TransactionStatusSchema,
  occurredAt: IsoDateTimeSchema,
});

export const SettlementEvidenceSchema = z
  .object({
    ...base,
    type: z.literal("settlement"),
    settlementId: IdSchema,
    amount: PaiseSchema,
    status: SettlementStatusSchema,
    settledAt: IsoDateTimeSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === "settled" && !val.settledAt) {
      ctx.addIssue({
        code: "custom",
        path: ["settledAt"],
        message: "settledAt is required when status is settled",
      });
    }
  });

export const DeliveryProofKindSchema = z.enum([
  "courier_tracking",
  "signed_receipt",
  "service_log",
]);

export const DeliveryStatusSchema = z.enum([
  "delivered",
  "in_transit",
  "returned_to_origin",
  "failed",
  "unknown",
]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const DeliveryProofEvidenceSchema = z
  .object({
    ...base,
    type: z.literal("delivery_proof"),
    kind: DeliveryProofKindSchema,
    status: DeliveryStatusSchema,
    deliveredAt: IsoDateTimeSchema.optional(),
    reference: z.string().min(1),
  })
  .superRefine((val, ctx) => {
    if (val.status === "delivered" && !val.deliveredAt) {
      ctx.addIssue({
        code: "custom",
        path: ["deliveredAt"],
        message: "deliveredAt is required when status is delivered",
      });
    }
    if (val.status !== "delivered" && val.deliveredAt !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["deliveredAt"],
        message: "deliveredAt must be absent unless status is delivered",
      });
    }
  });

export const CustomerMessageEvidenceSchema = z.object({
  ...base,
  type: z.literal("customer_message"),
  channel: MessageChannelSchema,
  sentAt: IsoDateTimeSchema,
  content: z.string(),
  language: z.string().min(1),
});

export const RefundEvidenceSchema = z
  .object({
    ...base,
    type: z.literal("refund"),
    amount: PaiseSchema,
    status: RefundStatusSchema,
    issuedAt: IsoDateTimeSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === "issued" && !val.issuedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["issuedAt"],
        message: "issuedAt is required when status is issued",
      });
    }
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
