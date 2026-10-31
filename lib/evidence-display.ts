// Pure helpers for showing evidence. No imports from Next or Prisma.
import type { Evidence } from "../contracts";

type EvidenceType = Evidence["type"];

// Record<EvidenceType, ...> makes the compiler reject a new evidence type
// until it gets a label here.
const LABELS: Record<EvidenceType, string> = {
  transaction: "Transaction",
  settlement: "Settlement",
  delivery_proof: "Delivery proof",
  customer_message: "Customer message",
  refund: "Refund",
};

// Display order of the groups on the page.
const ORDER: readonly EvidenceType[] = [
  "transaction",
  "settlement",
  "delivery_proof",
  "customer_message",
  "refund",
];

export function evidenceTypeLabel(type: EvidenceType): string {
  return LABELS[type];
}

export type EvidenceGroup = {
  type: EvidenceType;
  label: string;
  items: Evidence[];
};

/** Groups evidence by type in display order, skipping types with no items. */
export function groupEvidenceByType(evidence: readonly Evidence[]): EvidenceGroup[] {
  return ORDER.map((type) => ({
    type,
    label: LABELS[type],
    items: evidence.filter((e) => e.type === type),
  })).filter((group) => group.items.length > 0);
}
