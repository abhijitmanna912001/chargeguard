// Pure helpers for showing evidence. No imports from Next or Prisma.
import type { Evidence, MessageChannel } from "../contracts";

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

// Record<MessageChannel, ...> makes the compiler reject a new channel until it
// gets a name here.
const CHANNEL_NAMES: Record<MessageChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
  call: "Call",
};

export function channelLabel(channel: MessageChannel): string {
  return CHANNEL_NAMES[channel];
}

/** "hi" -> "Hindi (hi)". Unknown or malformed codes come back unchanged. */
export function languageLabel(code: string, displayNames?: Intl.DisplayNames): string {
  try {
    const names = displayNames ?? new Intl.DisplayNames(["en"], { type: "language" });
    const name = names.of(code);
    // of() returns the code itself when it has no name for it (fallback: "code").
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    // RangeError for a structurally invalid tag such as "not a code".
    return code;
  }
}
