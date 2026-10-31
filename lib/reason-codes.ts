// Pure display helper. No imports from Next or Prisma.

// DEMO MAPPING ONLY. The synthetic demo data uses Visa-style numeric codes and a
// few readable enum codes. This is not an authoritative card-scheme reason-code
// table; a real integration would take labels from the provider. Unknown codes
// are shown as they are.
const REASON_LABELS: Record<string, string> = {
  "13.1": "Goods not received",
  "13.2": "Cancelled recurring payment",
  "13.3": "Not as described",
  "13.6": "Credit not processed",
  "10.4": "Fraud: card not present",
  GOODS_NOT_RECEIVED: "Goods not received",
  SERVICE_NOT_RENDERED: "Service not rendered",
  CREDIT_NOT_PROCESSED: "Credit not processed",
  DUPLICATE_TRANSACTION: "Duplicate transaction",
};

/**
 * "13.1" -> "Goods not received (13.1)". Readable enum codes such as
 * GOODS_NOT_RECEIVED show the label alone, since the code would only repeat it.
 * Unknown codes fall back to the code itself.
 */
export function reasonLabel(code: string): string {
  const label = Object.hasOwn(REASON_LABELS, code) ? REASON_LABELS[code] : undefined;
  if (!label) return code;
  return /^\d/.test(code) ? `${label} (${code})` : label;
}
