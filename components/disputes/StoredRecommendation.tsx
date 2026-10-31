import type { Recommendation } from "@/contracts";
import { ActionBadge } from "./ActionBadge";
import { MockTag } from "./MockTag";

// Shared by the list and detail pages. Shows the dispute's STORED latest
// recommendation (the rules' final action), never a computed placeholder.
// The "Mock" tag appears only while the mock agent is the active agent.
export function StoredRecommendation({
  recommendation,
  isMock,
}: {
  recommendation: Recommendation | null | undefined;
  isMock: boolean;
}) {
  if (!recommendation) {
    return <span className="text-sm text-ink-muted">Not run yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <ActionBadge action={recommendation.finalAction} />
      {isMock && <MockTag />}
    </span>
  );
}
