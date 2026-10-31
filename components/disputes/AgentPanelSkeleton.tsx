import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

export function AgentPanelSkeleton() {
  return (
    <SkeletonGroup label="Loading agent panel…" className="space-y-3">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-56 w-full rounded-lg" />
    </SkeletonGroup>
  );
}
