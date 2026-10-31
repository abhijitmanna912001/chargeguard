import type { Recommendation } from "@/contracts";
import { ActionBadge } from "./ActionBadge";

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
    return <span className="text-sm text-zinc-600 dark:text-zinc-400">Not run yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <ActionBadge action={recommendation.finalAction} />
      {isMock && (
        <span className="rounded border border-dashed border-zinc-500 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
          Mock
        </span>
      )}
    </span>
  );
}
