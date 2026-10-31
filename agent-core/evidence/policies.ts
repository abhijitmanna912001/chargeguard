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

export const DEFAULT_EVIDENCE_POLICIES: EvidencePolicyRegistry = {
  GOODS_NOT_RECEIVED: {
    description: "Customer says the order never arrived",
    requirements: [
      transaction,
      // Any delivery record counts as present. Whether it shows delivery,
      // a return or a failure is for the decision layer to weigh.
      { type: "delivery_proof", description: "delivery_proof" },
    ],
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
