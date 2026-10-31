import type { Dispute } from "@/contracts";
import { getMockRecommendation } from "@/lib/mock/recommendation";
import { ActionBadge } from "./ActionBadge";

// Shared by the list and detail pages so the "Mock" tag is never left off.
export function MockRecommendation({ dispute }: { dispute: Dispute }) {
  const recommendation = getMockRecommendation(dispute);
  return (
    <span className="inline-flex items-center gap-2">
      <ActionBadge action={recommendation.action} />
      <span className="rounded border border-dashed border-zinc-500 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
        {recommendation.label}
      </span>
    </span>
  );
}
