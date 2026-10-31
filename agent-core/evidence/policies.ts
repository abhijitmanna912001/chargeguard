import type { EvidencePolicy, EvidencePolicyRegistry, EvidenceRequirement } from "./types";

// SYNTHETIC PROTOTYPE POLICY. These requirements were written for the
// ChargeGuard demo dataset. They are not official Paytm, bank or card-network
// evidence rules and must not be presented as such.

const transaction: EvidenceRequirement = {
  type: "transaction",
  description: "transaction",
};

// DUPLICATE_TRANSACTION is deliberately absent. Assessing it needs the second
// charge, but transaction evidence must match dispute.transactionId to be
// trusted, and settlements carry no transaction id. The contract cannot show
// a duplicate, so the code stays unsupported (unsupported_reason_code).

const goodsNotReceived: EvidencePolicy = {
  description: "Customer says the order never arrived",
  requirements: [
    transaction,
    // Any delivery record counts as present. Whether it shows delivery,
    // a return or a failure is for the decision layer to weigh.
    { type: "delivery_proof", description: "delivery_proof" },
  ],
};

export const DEFAULT_EVIDENCE_POLICIES: EvidencePolicyRegistry = {
  GOODS_NOT_RECEIVED: goodsNotReceived,
  // PROTOTYPE ALIAS. fixtures/cases.ts uses reason code "13.1" and labels it
  // "merchandise / services not received", so for the synthetic demo it
  // shares the GOODS_NOT_RECEIVED requirements (delivery_proof also covers
  // service logs). This follows the project's fixture convention only; it is
  // not a verified card-network rule. Matched exactly, like every other key.
  "13.1": {
    ...goodsNotReceived,
    description: "Prototype alias of GOODS_NOT_RECEIVED: merchandise / services not received",
  },
  CREDIT_NOT_PROCESSED: {
    description: "Customer says a promised refund never arrived",
    requirements: [transaction, { type: "refund", description: "refund" }],
  },
};

/** Exact match only; prototype keys such as "constructor" never resolve. */
export function findPolicy(registry: EvidencePolicyRegistry, reasonCode: string): EvidencePolicy | undefined {
  return Object.hasOwn(registry, reasonCode) ? registry[reasonCode] : undefined;
}
