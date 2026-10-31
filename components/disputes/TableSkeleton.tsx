import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

const ROWS = 4;

export function TableSkeleton() {
  return (
    <SkeletonGroup label="Loading disputes…" className="space-y-3">
      {Array.from({ length: ROWS }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg md:h-14" />
      ))}
    </SkeletonGroup>
  );
}
