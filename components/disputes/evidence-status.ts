import type { Evidence } from "@/contracts";
import type { Tone } from "@/components/ui/tones";
import { humanizeEnum } from "@/lib/format";

/** The status line shown on an evidence card, or null for types without one (customer messages). */
export function evidenceStatus(evidence: Evidence): { label: string; tone: Tone } | null {
  switch (evidence.type) {
    case "transaction":
      return { label: humanizeEnum(evidence.status), tone: evidence.status === "success" ? "success" : evidence.status === "failed" ? "danger" : "warning" };
    case "settlement":
      return { label: humanizeEnum(evidence.status), tone: evidence.status === "settled" ? "success" : evidence.status === "failed" ? "danger" : "warning" };
    case "refund":
      // An issued refund is a risk to a defence, so it is a caution, not a success.
      return { label: humanizeEnum(evidence.status), tone: evidence.status === "issued" ? "caution" : evidence.status === "failed" ? "danger" : "warning" };
    case "delivery_proof":
      return {
        label: humanizeEnum(evidence.status),
        tone: evidence.status === "delivered" ? "success" : evidence.status === "in_transit" ? "warning" : evidence.status === "unknown" ? "neutral" : "danger",
      };
    case "customer_message":
      return null;
  }
}
