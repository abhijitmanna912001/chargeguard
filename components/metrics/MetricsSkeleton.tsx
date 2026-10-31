import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// Block sizes match the loaded stat tiles and table so the page does not jump.
export function MetricsSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[5.5rem] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </SkeletonGroup>
  );
}
