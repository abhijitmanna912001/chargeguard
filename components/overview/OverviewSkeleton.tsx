import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// Block sizes match the loaded sections so the page does not jump when data arrives.
export function OverviewSkeleton() {
  return (
    <SkeletonGroup label="Loading overview…" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-[7.5rem] w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[8.5rem] rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </SkeletonGroup>
  );
}
