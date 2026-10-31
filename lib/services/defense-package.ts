// Pure: builds the defense response from the dispute's evidence. The summary is
// a fixed template over evidence facts; no model text is copied into it.
import {
  DefensePackageSchema,
  type DefensePackage,
  type Dispute,
  type Evidence,
  type Recommendation,
} from "../../contracts";
import { formatPaise } from "../format";

function latest<T extends Evidence["type"]>(dispute: Dispute, type: T) {
  const matches = dispute.evidence.filter((e): e is Extract<Evidence, { type: T }> => e.type === type);
  return matches[matches.length - 1];
}

/** "2026-10-24T11:40:00.000Z" -> "2026-10-24" (UTC). */
const day = (iso: string) => iso.slice(0, 10);

export function buildDefensePackage(dispute: Dispute, recommendation: Recommendation): DefensePackage {
  if (recommendation.disputeId !== dispute.id) {
    throw new Error(`Recommendation ${recommendation.id} does not belong to dispute ${dispute.id}`);
  }

  const delivery = latest(dispute, "delivery_proof");
  const settlement = latest(dispute, "settlement");
  const message = latest(dispute, "customer_message");

  const parts = [
    `Defense for dispute ${dispute.id}, reason code ${dispute.reasonCode}, amount ${formatPaise(dispute.amount)}.`,
    !delivery
      ? "No delivery proof is on file."
      : delivery.status === "delivered" && delivery.deliveredAt
        ? `Delivery proof ${delivery.reference} shows delivery on ${day(delivery.deliveredAt)}.`
        : `Delivery proof ${delivery.reference} has status ${delivery.status}.`,
    !settlement
      ? "No settlement record is on file."
      : settlement.status === "settled" && settlement.settledAt
        ? `Settlement ${settlement.settlementId} was settled on ${day(settlement.settledAt)}.`
        : `Settlement ${settlement.settlementId} has status ${settlement.status}.`,
    message
      ? `The customer's message was sent in language "${message.language}".`
      : "No customer message is on file.",
  ];

  // Prefer the evidence the recommendation cited (what the approver saw); fall
  // back to the evidence the summary is built from. Unknown ids are dropped.
  const known = new Set(dispute.evidence.map((e) => e.id));
  const cited = (recommendation.modelOutput?.evidenceRefs ?? []).filter((id) => known.has(id));
  const factRefs = [delivery, settlement, message].filter((e) => e !== undefined).map((e) => e.id);

  return DefensePackageSchema.parse({
    disputeId: dispute.id,
    reasonCode: dispute.reasonCode,
    amountPaise: dispute.amount,
    summary: parts.join(" "),
    evidenceRefs: cited.length > 0 ? cited : factRefs,
  });
}
