import type { DisputeStatus } from "@/contracts";
import type { Tone } from "./tones";

// "submitted" is deliberately not green: a submitted response is not a won dispute.
const STATUS: Record<DisputeStatus, { label: string; tone: Tone }> = {
  received: { label: "Received", tone: "neutral" },
  gathering: { label: "Gathering evidence", tone: "accent" },
  decided: { label: "Decided", tone: "brand" },
  awaiting_approval: { label: "Awaiting approval", tone: "warning" },
  submitted: { label: "Response submitted", tone: "accent" },
  accepted: { label: "Accepted", tone: "neutral" },
  escalated: { label: "Escalated", tone: "caution" },
  expired: { label: "Expired", tone: "danger" },
};

/** The label and tone for a dispute status. */
export function statusDisplay(status: DisputeStatus): { label: string; tone: Tone } {
  return STATUS[status];
}
