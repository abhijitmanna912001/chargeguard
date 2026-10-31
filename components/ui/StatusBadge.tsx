import type { DisputeStatus } from "@/contracts";
import { Badge } from "./Badge";
import { statusDisplay } from "./status";

export function StatusBadge({ status }: { status: DisputeStatus }) {
  const { label, tone } = statusDisplay(status);
  return <Badge tone={tone}>{label}</Badge>;
}
